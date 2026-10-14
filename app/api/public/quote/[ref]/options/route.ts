import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/resilience";
import { corsHeaders } from "@/lib/api-auth";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
import { loadQuoteCatalogue } from "@/lib/quote-pricing";
import { resolveRepair, checked } from "@/lib/repair-journey";
import {
  verifyRequestedAddOns,
  verifyRequestedAccessories,
  normalizePublicQuoteRef,
} from "@/lib/public-quote-options";
export const dynamic = "force-dynamic";
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req) });
}
export async function POST(
  req: NextRequest,
  { params }: { params: { ref: string } },
) {
  const headers = corsHeaders(req);
  try {
    if (!(await checkRateLimit(getClientIP(req), "quote-options", 15)).allowed)
      throw Error("Too many requests");
    const db = createServiceClient(),
      ref = normalizePublicQuoteRef(params.ref),
      r = await resolveRepair(db, ref, req.nextUrl.searchParams.get("t") || ""),
      body = await req.json(),
      c = await loadQuoteCatalogue(),
      catalogue = Object.assign(c.quotes, {
        policy: c.serviceGuidance,
        accessories: c.accessories,
      }),
      v = r.enquiry || r.job;
    if (
      (r.enquiry?.customer_response || r.record.customer_response) === "cancel" ||
      ["CANCELLED", "cancelled", "COLLECTED", "COMPLETED"].includes(
        r.record.status,
      )
    )
      throw Error("This repair cannot be changed online");
    const context = {
      category: v.device_category || v.device_type,
      brand: v.device_make,
      model: v.device_model,
      primaryRepair: v.repair_type || v.issue,
    };
    const repairs = verifyRequestedAddOns(
        body.additional_repairs || [],
        catalogue,
        context,
      ),
      accessories = verifyRequestedAccessories(
        body.accessories || [],
        context,
        catalogue,
      );
    if (
      repairs.length !== (body.additional_repairs || []).length ||
      accessories.length !== (body.accessories || []).length
    )
      throw Error("One or more selected options are unavailable");
    return NextResponse.json(
      {
        success: true,
        ...(await checked(
          db.rpc("add_repair_options", {
            p_ref: ref,
            p_repairs: repairs,
            p_accessories: accessories,
          }),
        )),
      },
      { headers },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409, headers });
  }
}
