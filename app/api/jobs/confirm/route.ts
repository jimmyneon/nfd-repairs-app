import { NextRequest, NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/resilience";
import { checked } from "@/lib/repair-journey";
import { snapshot, completeTotal, pence } from "@/lib/quote-pricing";
import {
  generateQuoteActionToken,
  quoteActionTokenExpiry,
} from "@/lib/job-utils";
import {
  confirmationText,
  enqueueRepairMessage,
  deliverRepairMessages,
} from "@/lib/repair-messages";
export async function POST(req: NextRequest) {
  const auth = await requireStaffUser(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.json(),
      db = createServiceClient(),
      j: any = await checked(
        db.from("jobs").select("*").eq("id", body.job_id).single(),
      );
    const total =
      body.confirmed_total != null
        ? pence(body.confirmed_total)
        : completeTotal(j);
    if (total <= 0) throw Error("Enter the complete repair total");
    const token = j.quote_action_token || generateQuoteActionToken();
    const ver = j.quote_version + 1;
    const updated: any = await checked(
      db
        .from("jobs")
        .update({
          price_total: total / 100,
          part_option: body.part_option || j.part_option,
          quote_version: ver,
          quote_accepted_version: null,
          quote_confirmed_at: new Date().toISOString(),
          quote_snapshot: {
            ...snapshot(j),
            total_pence: total,
            part_option: body.part_option || j.part_option,
          },
          quote_action_token: token,
          quote_action_token_expires_at: quoteActionTokenExpiry(),
          quote_action_token_revoked_at: null,
        })
        .eq("id", j.id)
        .select("*")
        .single(),
    );
    const e = { enquiry_ref: j.id, quote_action_token: token };
    await enqueueRepairMessage(
      db,
      updated,
      "confirmed",
      confirmationText(updated, e),
    );
    return NextResponse.json({
      success: true,
      ...(await deliverRepairMessages(db, j.id)),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
}
