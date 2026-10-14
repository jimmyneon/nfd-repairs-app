import { NextRequest, NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/resilience";
import { checked, journeyUrl } from "@/lib/repair-journey";
import {
  enqueueRepairMessage,
  deliverRepairMessages,
} from "@/lib/repair-messages";
export async function POST(req: NextRequest, context: any) {
  const auth = await requireStaffUser(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.json().catch(() => ({})),
      id = context?.params?.jobId || body.jobId,
      db = createServiceClient();
    const job: any = await checked(
      db.from("jobs").select("*").eq("id", id).single(),
    );
    const e: any = await checked(
      db.from("enquiries").select("*").eq("converted_job_id", id).maybeSingle(),
    );
    if (!e?.quote_action_token)
      throw Error("Send a secure confirmed quote first");
    const money: any = await checked(
      db.rpc("repair_money", { p_job: id, p_ref: null }),
    );
    if (money.fully_paid)
      throw Error("Already paid in full; no deposit is needed");
    const url = journeyUrl(e.enquiry_ref, e.quote_action_token);
    await enqueueRepairMessage(
      db,
      job,
      "payment-link",
      `Your NFD repair total is £${(money.total_pence / 100).toFixed(2)}. ${money.deposit_due_pence > 0 ? `Pay a £${(money.deposit_due_pence / 100).toFixed(2)} deposit, deducted from your total, or pay the full outstanding amount.` : "Pay cash/card on collection, or pay online if you prefer."}\n\nView the confirmed timing and payment options:\n${url}`,
    );
    return NextResponse.json({
      success: true,
      pay_url: url,
      ...(await deliverRepairMessages(db, id)),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
}
