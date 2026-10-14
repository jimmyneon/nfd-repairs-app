export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/resilience";
import { checked } from "@/lib/repair-journey";
export async function GET(req: NextRequest) {
  const auth = await requireStaffUser(req);
  if (auth.response) return auth.response;
  try {
    const rows = await checked(
      createServiceClient()
        .from("payments")
        .select(
          "id,kind,provider,amount_pence,refunded_pence,status,stripe_payment_intent_id,job_id,enquiry_ref,repair_fund_id,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
    );
    return NextResponse.json({ payments: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
}
