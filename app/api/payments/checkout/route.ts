import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/resilience";
import { corsHeaders } from "@/lib/api-auth";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
import { checkoutRepair } from "@/lib/payments";
export const dynamic = "force-dynamic";
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req) });
}
export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  if (
    !(await checkRateLimit(getClientIP(req), "payments-checkout", 20)).allowed
  )
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers },
    );
  try {
    return NextResponse.json(
      await checkoutRepair(createServiceClient(), await req.json()),
      { headers },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unable to start payment" },
      { status: 409, headers },
    );
  }
}
