export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/resilience";
import { checked } from "@/lib/repair-journey";
export async function GET(req: NextRequest) {
  const auth = await requireStaffUser(req);
  if (auth.response) return auth.response;
  try {
    const db = createServiceClient(),
      job = req.nextUrl.searchParams.get("job_id") || "";
    const e: any = await checked(
      db
        .from("enquiries")
        .select("id,enquiry_ref")
        .eq("converted_job_id", job)
        .maybeSingle(),
    );
    const money: any = await checked(
      db.rpc("repair_money", { p_job: job, p_ref: null }),
    );
    const funds: any[] = e
      ? await checked(
          db.from("repair_funds").select("id").eq("enquiry_ref", e.enquiry_ref),
        )
      : [];
    const filters = [
      `job_id.eq.${job}`,
      ...(e ? [`enquiry_ref.eq.${e.enquiry_ref}`] : []),
      ...funds.map((f) => `repair_fund_id.eq.${f.id}`),
    ].join(",");
    const rows = await checked(
      db
        .from("payments")
        .select(
          "id,kind,provider,amount_pence,refunded_pence,status,stripe_payment_intent_id,stripe_session_id,created_at",
        )
        .or(filters)
        .order("created_at", { ascending: false }),
    );
    const j: any = await checked(
      db
        .from("jobs")
        .select(
          "quote_confirmed_at,quote_version,quote_accepted_version,part_option,device_colour,requires_parts_order",
        )
        .eq("id", job)
        .single(),
    );
    return NextResponse.json({
      ...money,
      payments: rows,
      enquiry_id: e?.id || null,
      needs_confirmation: !j.quote_confirmed_at,
      part_option: j.part_option,
      device_colour: j.device_colour,
      requires_parts_order: j.requires_parts_order,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
}
