export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffOrCron } from "@/lib/api-auth";
import { createServiceClient, getUKHour } from "@/lib/resilience";
import { checked, journeyUrl } from "@/lib/repair-journey";
import { recoverPaymentSession } from "@/lib/payment-reconciliation";
import {
  deliverRepairMessages,
  enqueueRepairMessage,
} from "@/lib/repair-messages";
export async function GET(req: NextRequest) {
  const auth = await requireStaffOrCron(req);
  if (auth) return auth;
  const db = createServiceClient();
  let recovered = 0,
    failed = 0;
  const rows: any[] = await checked(
    db
      .from("payments")
      .select("id,stripe_session_id,created_at,expires_at")
      .in("status", ["open", "creating", "paid", "refunded"])
      .order("updated_at", { ascending: true })
      .limit(50),
  );
  for (const row of rows) {
    try {
      await recoverPaymentSession(db, row);
      await checked(db.from("payments").update({updated_at: new Date().toISOString()}).eq("id", row.id));
      recovered++;
    } catch {
      failed++;
    }
  }
  if (getUKHour() >= 9 && getUKHour() < 18) {
    const waiting: any[] = await checked(
      db
        .from("jobs")
        .select("*")
        .eq("status", "AWAITING_DEPOSIT")
        .lt(
          "quote_confirmed_at",
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        )
        .limit(30),
    );
    for (const job of waiting) {
      const e: any = await checked(
        db
          .from("enquiries")
          .select("*")
          .eq("converted_job_id", job.id)
          .maybeSingle(),
      );
      if (e?.quote_action_token && !e.customer_response)
        await enqueueRepairMessage(
          db,
          job,
          "one-reminder",
          `Your repair is awaiting your response. Continue with the confirmed timing and payment options, or tell us if the timing does not suit you:\n${journeyUrl(e.enquiry_ref, e.quote_action_token)}\n\nNo parts have been ordered yet. NFD Repairs`,
        );
    }
  }
  const delivery = await deliverRepairMessages(db);
  return NextResponse.json({ recovered, failed, ...delivery });
}
