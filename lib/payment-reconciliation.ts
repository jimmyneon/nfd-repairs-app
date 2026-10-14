import { getStripe } from "./stripe";
import { checked } from "./repair-journey";
import { createServiceClient } from "./resilience";

export async function reconcileSession(
  db: ReturnType<typeof createServiceClient>,
  sessionId: string,
  eventId: string,
) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe unavailable");
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
  const intent: any = session.payment_intent;
  const pi =
    typeof intent === "string"
      ? await stripe.paymentIntents.retrieve(intent)
      : intent;
  let payment: any = await checked(
    db
      .from("payments")
      .select("*")
      .eq("stripe_session_id", session.id)
      .maybeSingle(),
  );
  if (!payment && session.metadata?.payment_id) {
    payment = await checked(
      db
        .from("payments")
        .update({ stripe_session_id: session.id })
        .eq("id", session.metadata.payment_id)
        .is("stripe_session_id", null)
        .select("*")
        .maybeSingle(),
    );
  }
  if (!payment) throw new Error("Unrecorded Stripe session requires review");
  if (session.payment_status === "paid" && pi?.status === "succeeded") {
    let refunded = 0;
    for await (const refund of stripe.refunds.list({
      payment_intent: pi.id,
      limit: 100,
    })) {
      await checked(
        db
          .from("repair_refunds")
          .upsert(
            {
              stripe_refund_id: refund.id,
              payment_id: payment.id,
              amount_pence: refund.amount,
              status: refund.status,
              request_id: refund.metadata?.request_id || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "stripe_refund_id" },
          ),
      );
      if (refund.status === "succeeded") refunded += refund.amount;
    }
    await checked(
      db.rpc("apply_verified_payment", {
        p_event: eventId,
        p_session: session.id,
        p_intent: pi.id,
        p_amount: session.amount_total,
        p_currency: session.currency,
        p_refunded: refunded,
      }),
    );
  } else if (
    session.status === "expired" ||
    (session.status === "complete" && pi?.status === "canceled")
  ) {
    await checked(
      db
        .from("payments")
        .update({ status: "expired" })
        .eq("id", payment.id)
        .in("status", ["open", "creating"]),
    );
  }
  return session;
}

export async function recoverPaymentSession(
  db: ReturnType<typeof createServiceClient>,
  row: any,
) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe unavailable");
  let id = row.stripe_session_id;
  if (!id) {
    for await (const session of stripe.checkout.sessions.list({
      created: {
        gte: Math.floor(new Date(row.created_at).getTime() / 1000) - 60,
      },
      limit: 100,
    })) {
      if (session.metadata?.payment_id === row.id) {
        id = session.id;
        break;
      }
    }
    if (!id && new Date(row.expires_at).getTime() < Date.now())
      await checked(
        db
          .from("payments")
          .update({ status: "expired" })
          .eq("id", row.id)
          .eq("status", "creating"),
      );
  }
  if (id) await reconcileSession(db, id, `recovery:${id}`);
}

/** Close a provider checkout before switching to a shop payment. Never erase a receipt. */
export async function closeUnpaidCheckout(db: ReturnType<typeof createServiceClient>, row: any) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe unavailable");
  await recoverPaymentSession(db, row);
  const current: any = await checked(db.from("payments").select("*").eq("id", row.id).single());
  if (!["open", "creating"].includes(current.status)) return;
  if (!current.stripe_session_id) throw new Error("Checkout creation is still being reconciled. Refresh shortly before recording shop payment.");
  let session = await stripe.checkout.sessions.retrieve(current.stripe_session_id);
  if (session.status === "open") {
    try { session = await stripe.checkout.sessions.expire(session.id); }
    catch {
      await reconcileSession(db, session.id, `close-race:${session.id}`);
      throw new Error("The payment changed while closing checkout. Refresh the balance first.");
    }
  }
  if (session.status !== "expired") throw new Error("This payment is processing or already completed. Refresh the balance first.");
  await checked(db.from("payments").update({status: "expired", updated_at: new Date().toISOString()}).eq("id", row.id).in("status", ["open", "creating"]));
}
