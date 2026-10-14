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
    if (!(await checkRateLimit(getClientIP(req), "fund-redeem", 5)).allowed)
      throw Error("Too many requests");
    const body = await req.json(),
      db = createServiceClient(),
      fund: any = await checked(
        db
          .from("repair_funds")
          .select("id")
          .eq("fund_token", String(body.token || ""))
          .single(),
      );
    return NextResponse.json(
      {
        ok: true,
        ...(await checked(db.rpc("redeem_repair_fund", { p_fund: fund.id }))),
      },
      { headers },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409, headers });
  }
}
