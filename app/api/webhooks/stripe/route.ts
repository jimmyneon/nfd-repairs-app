import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/resilience";
import { getStripe } from "@/lib/stripe";
import { checked } from "@/lib/repair-journey";
import { reconcileSession } from "@/lib/payment-reconciliation";
import { deliverRepairMessages } from "@/lib/repair-messages";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  const stripe = getStripe(),
    secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret)
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      req.headers.get("stripe-signature") || "",
      secret,
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const db = createServiceClient();
  try {
    await checked(
      db
        .from("repair_payment_events")
        .upsert(
          { event_id: event.id, payload: event },
          { onConflict: "event_id", ignoreDuplicates: true },
        ),
    );
    const object = event.data.object;
    if (event.type.startsWith("checkout.session."))
      await reconcileSession(db, object.id, event.id);
    else if (
      [
        "charge.refunded",
        "refund.created",
        "refund.updated",
        "refund.failed",
        "payment_intent.succeeded",
      ].includes(event.type)
    ) {
      const intent = event.type.startsWith("payment_intent.")
        ? object.id
        : typeof object.payment_intent === "string"
          ? object.payment_intent
          : object.payment_intent?.id;
      if (intent) {
        const row: any = await checked(
          db
            .from("payments")
            .select("stripe_session_id")
            .eq("stripe_payment_intent_id", intent)
            .maybeSingle(),
        );
        if (row?.stripe_session_id)
          await reconcileSession(db, row.stripe_session_id, event.id);
      }
    }
    // Delivery failures remain in the outbox and never erase the verified receipt.
    await deliverRepairMessages(db).catch(() => {});
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Stripe] reconciliation failed", error);
    return NextResponse.json(
      { error: "Payment reconciliation failed; retry required" },
      { status: 500 },
    );
  }
}
