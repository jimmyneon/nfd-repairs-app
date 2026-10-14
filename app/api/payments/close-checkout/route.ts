import { NextRequest, NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/resilience";
import { checked } from "@/lib/repair-journey";
import { closeUnpaidCheckout } from "@/lib/payment-reconciliation";

export async function POST(req: NextRequest) {
  const auth = await requireStaffUser(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.json(), db = createServiceClient();
    const row: any = await checked(db.from("payments").select("*").eq("id", body.payment_id).single());
    await closeUnpaidCheckout(db, row);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
}
