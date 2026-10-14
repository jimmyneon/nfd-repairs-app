import { NextRequest, NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/resilience";
import { checked } from "@/lib/repair-journey";
import { pence } from "@/lib/quote-pricing";
import { getStripe } from "@/lib/stripe";
import { reconcileSession } from "@/lib/payment-reconciliation";
export async function POST(req: NextRequest) {
  const auth = await requireStaffUser(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.json();
    const db = createServiceClient(),
      stripe = getStripe();
    if (!stripe) throw Error("Stripe unavailable");
    const row: any = await checked(
      db.from("payments").select("*").eq("id", body.payment_id).single(),
    );
    await reconcileSession(db, row.stripe_session_id, `pre-refund:${row.id}`);
    const current: any = await checked(
      db.from("payments").select("refunded_pence").eq("id", row.id).single(),
    );
    const pending: any[] = await checked(
      db
        .from("repair_refunds")
        .select("amount_pence,request_id")
        .eq("payment_id", row.id)
        .in("status", ["pending", "requires_action"]),
    );
    const pendingAmount = pending
      .filter((x) => x.request_id !== body.request_id)
      .reduce((sum, x) => sum + x.amount_pence, 0);
    const amount = pence(body.amount);
    if (
      !amount ||
      !row.stripe_payment_intent_id ||
      amount > row.amount_pence - current.refunded_pence - pendingAmount ||
      !/^[\w-]{16,100}$/.test(body.request_id || "")
    )
      throw Error("Invalid refund request");
    const refund = await stripe.refunds.create(
      {
        payment_intent: row.stripe_payment_intent_id,
        amount,
        metadata: { payment_id: row.id, request_id: body.request_id },
      },
      { idempotencyKey: `nfd-refund:${row.id}:${body.request_id}` },
    );
    await reconcileSession(db, row.stripe_session_id, `refund:${refund.id}`);
    return NextResponse.json({ refund_id: refund.id, status: refund.status });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
}
