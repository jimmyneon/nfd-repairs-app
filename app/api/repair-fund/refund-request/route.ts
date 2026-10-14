import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/resilience";
import { corsHeaders } from "@/lib/api-auth";
import { checked } from "@/lib/repair-journey";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req) });
}
export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  try {
    if (
      !(await checkRateLimit(getClientIP(req), "fund-refund-request", 3))
        .allowed
    )
      throw Error("Too many requests");
    const body = await req.json(),
      db = createServiceClient(),
      f: any = await checked(
        db
          .from("repair_funds")
          .select("id,enquiry_ref")
          .eq("fund_token", String(body.token || ""))
          .single(),
      );
    await checked(
      db
        .from("notifications")
        .insert({
          type: "ACTION_REQUIRED",
          title: "Repair savings refund requested",
          body: `${f.enquiry_ref} — refund requested for savings fund ${f.id}`,
          is_read: false,
        }),
    );
    return NextResponse.json({ success: true }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409, headers });
  }
}
