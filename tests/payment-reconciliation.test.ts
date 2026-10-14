import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ row: {} as any, session: {} as any, expire: vi.fn(), updates: [] as any[] }));
vi.mock("@/lib/stripe", () => ({ getStripe: () => ({
  checkout: { sessions: { retrieve: async () => state.session, expire: state.expire } },
  refunds: { list: async function* () {} },
}) }));
import { closeUnpaidCheckout } from "../lib/payment-reconciliation";
const db: any = {
  from: () => {
    let update: any;
    const q: any = {
      select() { return q; }, eq() { return q; }, in() { return q; }, is() { return q; },
      update(v: any) { update = v; return q; },
      single: async () => ({ data: { ...state.row }, error: null }),
      maybeSingle: async () => ({ data: { ...state.row }, error: null }),
      then(resolve: any) {
        if (update) { state.updates.push(update); Object.assign(state.row, update); }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      },
    };
    return q;
  },
  rpc: async () => { state.row.status = "paid"; return { data: null, error: null }; },
};
beforeEach(() => {
  state.row = { id: "p1", stripe_session_id: "cs_test", status: "open" };
  state.session = { id: "cs_test", status: "open", payment_status: "unpaid" };
  state.expire.mockReset().mockResolvedValue({ id: "cs_test", status: "expired" });
  state.updates = [];
});
describe("closing a checkout before shop payment", () => {
  it("expires the provider session before releasing its local reservation", async () => {
    await closeUnpaidCheckout(db, state.row);
    expect(state.expire).toHaveBeenCalledWith("cs_test");
    expect(state.row.status).toBe("expired");
  });
  it("retains completed payments and does not turn a receipt into an expired checkout", async () => {
    state.session = { id: "cs_test", status: "complete", payment_status: "paid", payment_intent: { id: "pi_test", status: "succeeded" }, amount_total: 2000, currency: "gbp" };
    await closeUnpaidCheckout(db, state.row);
    expect(state.row.status).toBe("paid");
    expect(state.expire).not.toHaveBeenCalled();
  });
  it("keeps a reservation while a completed payment is still processing", async () => {
    state.session.status = "complete";
    state.session.payment_intent = { status: "processing" };
    await expect(closeUnpaidCheckout(db, state.row)).rejects.toThrow(/processing/);
    expect(state.row.status).toBe("open");
    expect(state.expire).not.toHaveBeenCalled();
  });
});
