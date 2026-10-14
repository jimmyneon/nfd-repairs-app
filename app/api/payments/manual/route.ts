import { NextRequest, NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/resilience";
import { checked } from "@/lib/repair-journey";
import { pence } from "@/lib/quote-pricing";
export async function POST(req: NextRequest) {
  const auth = await requireStaffUser(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.json();
    return NextResponse.json(
      await checked(
        createServiceClient().rpc("record_manual_repair_payment", {
          p_job: body.job_id,
          p_amount: pence(body.amount),
          p_kind: body.deposit ? "manual_deposit" : "manual_payment",
          p_reference: String(body.reference || ""),
        }),
      ),
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
}
