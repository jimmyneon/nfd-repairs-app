import { beforeEach, describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({
  repair: null as any,
  row: null as any,
  session: null as any,
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/payment-reconciliation", () => ({
  reconcileSession: async () => {},
}));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        retrieve: async () => state.session,
        expire: vi.fn(),
        create: state.create,
      },
    },
  }),
}));
vi.mock("@/lib/repair-journey", () => ({
  siteBase: () => "https://newforestdevicerepairs.co.uk",
  checked: async (q: any) => {
    const { data, error } = await q;
    if (error) throw Error(error.message);
    return data;
  },
  paymentAllowed: (r: any) => r.allowed,
  resolveRepair: async () => state.repair,
}));
import { checkoutRepair } from "../lib/payments";
const db: any = {
  rpc: async () => ({ data: state.row }),
  from: () => ({
    update(v: any) {
      state.update(v);
      return this;
    },
    eq() {
      return this;
    },
    in() {
      return this;
    },
    then(resolve: any) {
      return Promise.resolve({ data: null, error: null }).then(resolve);
    },
  }),
};
beforeEach(() => {
  delete process.env.KLARNA_ADVANCE_CAPTURE_APPROVED;
  state.row = {
    id: "reserved-id",
    amount_pence: 16500,
    kind: "job_payment",
    quote_version: 1,
    status: "creating",
    expires_at: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
  };
  state.repair = {
    record: {
      allowed: true,
      quote_version: 1,
      device_model: "iPhone",
      status: "AWAITING_DEPOSIT",
    },
    job: { id: "job", tracking_token: "track" },
    money: { balance_due_pence: 16500, deposit_due_pence: 2000 },
  };
  state.session = null;
  state.create
    .mockReset()
    .mockResolvedValue({
      id: "cs_test",
      url: "https://checkout.stripe.test/session",
    });
  state.update.mockClear();
});
describe("provider checkout contract with mocked Stripe", () => {
  it("uses the reserved complete total and one deterministic provider idempotency key", async () => {
    await checkoutRepair(db, { kind: "job_payment", token: "track" });
    expect(state.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_method_types: ["card"],
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 16500 }),
          }),
        ],
        metadata: expect.objectContaining({ payment_id: "reserved-id" }),
      }),
      { idempotencyKey: "nfd-checkout:reserved-id" },
    );
  });
  it("does not offer Klarna on deposits or unapproved advance payments", async () => {
    state.row.kind = "job_deposit";
    state.row.amount_pence = 2000;
    process.env.KLARNA_ADVANCE_CAPTURE_APPROVED = "true";
    await checkoutRepair(db, { kind: "job_deposit", token: "track" });
    expect(state.create.mock.calls[0][0].payment_method_types).toEqual([
      "card",
    ]);
  });
  it("offers eligible Klarna at completion without manual capture", async () => {
    state.repair.record.status = "READY_TO_COLLECT";
    await checkoutRepair(db, { kind: "job_payment", token: "track" });
    expect(state.create.mock.calls[0][0].payment_method_types).toEqual([
      "card",
      "klarna",
    ]);
    expect(state.create.mock.calls[0][0].payment_intent_data).toBeUndefined();
  });
  it("blocks unconfirmed repairs and already-completed sessions rather than creating another payment", async () => {
    state.repair.record.allowed = false;
    await expect(
      checkoutRepair(db, { kind: "job_payment", token: "track" }),
    ).rejects.toThrow(/confirm/);
    state.repair.record.allowed = true;
    state.row.stripe_session_id = "cs_paid";
    state.session = { payment_status: "paid" };
    await expect(
      checkoutRepair(db, { kind: "job_payment", token: "track" }),
    ).rejects.toThrow(/received/);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("two simultaneous clicks use identical Stripe parameters and idempotency key", async () => {
    await Promise.all([
      checkoutRepair(db, { kind: "job_payment", token: "track" }),
      checkoutRepair(db, { kind: "job_payment", token: "track" }),
    ]);
    expect(state.create.mock.calls[0]).toEqual(state.create.mock.calls[1]);
  });
  it("does not turn a concurrent deposit reservation into a full-payment checkout", async () => {
    state.row.kind = "job_deposit";
    state.row.amount_pence = 2000;
    await expect(checkoutRepair(db, { kind: "job_payment", token: "track" })).rejects.toThrow(/prepared/);
    expect(state.create).not.toHaveBeenCalled();
  });
  it("does not submit an old unrecorded session with an invalid provider expiry", async () => {
    state.row.expires_at = new Date(Date.now() + 20 * 60 * 1000).toISOString();
    await expect(checkoutRepair(db, { kind: "job_payment", token: "track" })).rejects.toThrow(/reconciliation/);
    expect(state.create).not.toHaveBeenCalled();
  });
});
