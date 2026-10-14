import { reconcileSession } from "./payment-reconciliation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "./stripe";
import {
  checked,
  paymentAllowed,
  resolveRepair,
  siteBase,
} from "./repair-journey";

export type PaymentKind =
  | "job_deposit"
  | "job_payment"
  | "enquiry_deposit"
  | "enquiry_payment"
  | "remote_support"
  | "fund_topup";
export async function checkoutRepair(db: SupabaseClient, body: any) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Payments are not configured");
  const kind = body.kind as PaymentKind;
  if (
    ![
      "job_deposit",
      "job_payment",
      "enquiry_deposit",
      "enquiry_payment",
      "fund_topup",
    ].includes(kind)
  )
    throw new Error("Invalid payment choice");
  let repair: any = null,
    fund: any = null;
  if (kind === "fund_topup") {
    fund = await checked(
      db
        .from("repair_funds")
        .select("*")
        .eq("fund_token", String(body.fund_token || ""))
        .maybeSingle(),
    );
    if (!fund || fund.status !== "open")
      throw new Error("Savings are not available");
    const target = Number(body.amount);
    if (!Number.isFinite(target) || target < 5 || target > 500)
      throw new Error("Choose a top-up between £5 and £500");
    const e: any = await checked(
      db
        .from("enquiries")
        .select("*")
        .eq("enquiry_ref", fund.enquiry_ref)
        .single(),
    );
    if (
      !e.quoted_price ||
      !e.price_verified ||
      fund.quote_version !== e.quote_version ||
      e.customer_response === "cancel" ||
      ["cancelled", "rejected"].includes(e.status)
    )
      throw new Error("Please reconfirm the quote before saving");
    if (e.converted_job_id) {
      const job: any = await checked(db.from("jobs").select("status,customer_response").eq("id", e.converted_job_id).single());
      if (["CANCELLED", "COLLECTED", "COMPLETED"].includes(job.status) || job.customer_response === "cancel")
        throw new Error("This repair is no longer accepting savings");
    }
  } else {
    repair = await resolveRepair(
      db as any,
      body.token || body.enquiry_ref,
      String(body.t || ""),
      Boolean(body.token),
    );
    if (
      !paymentAllowed(repair.record) ||
      (repair.enquiry?.customer_response || repair.record.customer_response) === "cancel"
    )
      throw new Error(
        "We must confirm the current repair details before taking payment",
      );
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const row: any = await checked(
      db.rpc("reserve_repair_checkout", {
        p_job: repair?.job?.id || null,
        p_ref: repair?.enquiry?.enquiry_ref || null,
        p_fund: fund?.id || null,
        p_kind: kind,
        p_amount:
          kind === "fund_topup" ? Math.round(Number(body.amount) * 100) : null,
      }),
    );
    const expected =
      kind === "fund_topup"
        ? Math.min(
            Math.round(Number(body.amount) * 100),
            fund.target_amount_pence - fund.balance_pence,
          )
        : kind.endsWith("deposit")
          ? repair.money.deposit_due_pence
          : repair.money.balance_due_pence;
    let session: any = null;
    if (row.stripe_session_id)
      session = await stripe.checkout.sessions.retrieve(row.stripe_session_id);
    // Payment can finish before its webhook; reconcile rather than opening another checkout.
    if (session?.payment_status === "paid") {
      await reconcileSession(
        db as any,
        session.id,
        `checkout-recovery:${session.id}`,
      );
      throw new Error(
        "Payment received; we are updating your repair. Please refresh shortly.",
      );
    }
    if (!session && (row.kind !== kind || row.amount_pence !== expected ||
        (!fund && row.quote_version !== repair.record.quote_version))) {
      throw new Error("Another payment choice is still being prepared. Please refresh shortly before switching options.");
    }
    if (
      session &&
      (session.status !== "open" ||
        row.kind !== kind ||
        row.amount_pence !== expected ||
        (row.quote_version !== repair?.record?.quote_version && !fund))
    ) {
      if (session.status === "open")
        await stripe.checkout.sessions.expire(session.id);
      await checked(
        db
          .from("payments")
          .update({ status: "expired" })
          .eq("id", row.id)
          .in("status", ["open", "creating"]),
      );
      continue;
    }
    if (session) return { url: session.url, reused: true };
    if (new Date(row.expires_at).getTime() < Date.now() + 30 * 60 * 1000)
      throw new Error(
        "An unfinished payment needs staff reconciliation. Please contact us.",
      );
    const customer = repair?.record || fund;
    const returnUrl = fund
      ? `${siteBase()}/repair-fund/?token=${encodeURIComponent(body.fund_token)}`
      : `${siteBase()}/pay/?t=${encodeURIComponent(repair.job?.short_token || repair.job?.tracking_token || "")}`;
    // Klarna advance capture must be explicitly approved for this business before enabling it.
    const ready =
      repair &&
      ["READY_TO_COLLECT", "IN_STORAGE"].includes(repair.record.status);
    const klarna =
      kind !== "fund_topup" &&
      !kind.endsWith("deposit") &&
      (ready || process.env.KLARNA_ADVANCE_CAPTURE_APPROVED === "true");
    const created = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: klarna ? ["card", "klarna"] : ["card"],
        expires_at: Math.floor(new Date(row.expires_at).getTime() / 1000),
        customer_email: customer.customer_email || undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: row.amount_pence,
              product_data: {
                name:
                  kind === "fund_topup"
                    ? "Savings towards your NFD repair"
                    : `${kind.endsWith("deposit") ? "Repair deposit" : "Repair payment"} — ${customer.device_model || customer.device_summary || "device"}`,
              },
            },
          },
        ],
        success_url: `${returnUrl}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: returnUrl,
        metadata: {
          payment_id: row.id,
          kind: row.kind,
          quote_version: String(row.quote_version || ""),
          ...(repair?.job ? { job_id: repair.job.id } : {}),
        },
      },
      { idempotencyKey: `nfd-checkout:${row.id}` },
    );
    await checked(
      db
        .from("payments")
        .update({
          stripe_session_id: created.id,
          checkout_url: created.url,
          status: "open",
        })
        .eq("id", row.id)
        .eq("status", "creating"),
    );
    return { url: created.url, amount_pence: row.amount_pence };
  }
  throw new Error("Payment options changed. Please refresh and try again.");
}
