import { NextRequest, NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/resilience";
import { checked } from "@/lib/repair-journey";
export async function POST(req: NextRequest) {
  const auth = await requireStaffUser(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.json(),
      db = createServiceClient();
    const e: any = await checked(
      db
        .from("enquiries")
        .select("enquiry_ref")
        .eq("converted_job_id", body.job_id)
        .single(),
    );
    let q = db
      .from("repair_funds")
      .select("id")
      .eq("enquiry_ref", e.enquiry_ref)
      .in("status", ["open", "funded"]);
    if (body.fund_token) q = q.eq("fund_token", body.fund_token);
    const fund: any = await checked(q.single());
    return NextResponse.json({
      success: true,
      ...(await checked(db.rpc("redeem_repair_fund", { p_fund: fund.id }))),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
}
