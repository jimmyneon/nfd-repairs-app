import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/resilience";
import { corsHeaders } from "@/lib/api-auth";
import { resolveRepair, paymentAllowed } from "@/lib/repair-journey";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
export const dynamic = "force-dynamic";
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req) });
}
export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);
  if (!(await checkRateLimit(getClientIP(req), "payments-due", 30)).allowed)
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers },
    );
  try {
    const r = await resolveRepair(
      createServiceClient(),
      req.nextUrl.searchParams.get("token") || "",
      "",
      true,
    );
    return NextResponse.json(
      {
        ...r.money,
        job_ref: r.job.job_ref,
        device: [r.job.device_make, r.job.device_model].join(" "),
        status: r.job.status,
        can_pay: paymentAllowed(r.record),
        currency: "gbp",
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      { error: "Repair payment link unavailable" },
      { status: 404, headers },
    );
  }
}
