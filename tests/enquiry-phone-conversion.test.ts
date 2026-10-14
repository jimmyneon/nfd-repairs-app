import { beforeEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({ enquiry: {} as any, captured: null as any }));
vi.mock("@/lib/api-auth", () => ({
  requireStaffUser: async () => ({ user: { id: "staff" }, response: null }),
}));
vi.mock("@/lib/repair-messages", () => ({
  confirmationText: () => "confirmation",
  enqueueRepairMessage: async () => {},
  deliverRepairMessages: async () => ({
    email_sent: true,
    sms_sent: false,
    customer_notified: true,
  }),
}));
vi.mock("@/lib/resilience", () => ({
  createServiceClient: () => ({
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      single: async () => ({ data: state.enquiry, error: null }),
    }),
    rpc: async (_: any, args: any) => {
      state.captured = args;
      return {
        data: {
          ...args.p_job,
          id: "job-test",
          job_ref: "NF-TEST",
          quote_version: 1,
        },
        error: null,
      };
    },
  }),
}));
import { POST } from "../app/api/enquiries/convert-to-job/route";
beforeEach(() => {
  state.enquiry = {
    id: "enquiry-test",
    enquiry_ref: "ENQ-TEST",
    quote_action_token: "token",
    customer_name: "Test",
    customer_phone: null,
    customer_email: "test@example.com",
    quoted_price: 100,
    device_make: "Apple",
    device_model: "iPhone test",
    part_option: "Premium OLED",
    device_colour: "Black",
    repair_type: "Screen replacement",
    status: "approved",
    additional_repairs: [{ repair: "Battery replacement", price: 50 }],
    accessories: [{ name: "Protector", price: 15 }],
  };
  state.captured = null;
});
describe("staff parts confirmation", () => {
  it("allows email-only customers, preserves options and sends the complete £165 total", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/enquiries/convert-to-job", {
        method: "POST",
        body: JSON.stringify({
          enquiry_id: "enquiry-test",
          stock_status: "parts_needed",
          earliest_date: "2026-10-20",
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(state.captured.p_job).toMatchObject({
      customer_phone: null,
      customer_email: "test@example.com",
      price_total: 165,
      part_option: "Premium OLED",
      device_colour: "Black",
      deposit_amount: 20,
      status: "AWAITING_DEPOSIT",
      parts_expected_at: "2026-10-20T12:00:00.000Z",
    });
    expect(state.captured.p_job.parts_ordered_at).toBeUndefined();
    expect((await response.json()).email_sent).toBe(true);
  });
  it("requires contact details and a priced repair before taking a stock decision", async () => {
    state.enquiry.customer_email = null;
    let r = await POST(
      new NextRequest("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ enquiry_id: "e", stock_status: "in_stock" }),
      }),
    );
    expect(r.status).toBe(409);
    state.enquiry.customer_email = "test@example.com";
    state.enquiry.quoted_price = 0;
    state.enquiry.additional_repairs = [];
    state.enquiry.accessories = [];
    r = await POST(
      new NextRequest("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({ enquiry_id: "e", stock_status: "in_stock" }),
      }),
    );
    expect(r.status).toBe(409);
  });
  it("requires new acceptance when price or quality changes, and caps deposit to the total", async () => {
    await POST(
      new NextRequest("http://localhost/api", {
        method: "POST",
        body: JSON.stringify({
          enquiry_id: "e",
          stock_status: "parts_needed",
          confirmed_total: 170,
          part_option: "Genuine display",
          deposit_amount: 200,
        }),
      }),
    );
    expect(state.captured.p_changed).toBe(true);
    expect(state.captured.p_job).toMatchObject({
      price_total: 170,
      quoted_price: 105,
      part_option: "Genuine display",
      deposit_amount: 170,
      status: "AWAITING_CUSTOMER",
    });
  });
});
