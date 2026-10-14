import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createServiceClient, sendSms } from "@/lib/resilience";
import { sendEmail } from "@/lib/email";
import { corsHeaders } from "@/lib/api-auth";
import { checked, resolveRepair, siteBase } from "@/lib/repair-journey";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req) });
}
export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  try {
    if (
      !(await checkRateLimit(getClientIP(req), "repair-fund-create", 5)).allowed
    )
      throw Error("Too many requests");
    const body = await req.json(),
      db = createServiceClient(),
      r = await resolveRepair(
        db,
        String(body.enquiry_ref || ""),
        String(body.t || ""),
      );
    const e = r.enquiry;
    if (
      !e?.quoted_price ||
      !(e.price_verified || e.quote_confirmed_at) ||
      r.total <= 0
    )
      throw Error(
        "Request a personalised price first; saving starts after we confirm a price",
      );
    if (!e.customer_phone && !e.customer_email)
      throw Error("A mobile number or email is required");
    if (["CANCELLED", "cancelled", "rejected", "COLLECTED", "COMPLETED"].includes(r.record.status) || e.customer_response === "cancel")
      throw Error("This repair needs staff review");
    let fund: any = await checked(
      db
        .from("repair_funds")
        .select("*")
        .eq("enquiry_ref", e.enquiry_ref)
        .in("status", ["open", "funded"])
        .maybeSingle(),
    );
    if (!fund) {
      const created = await db
        .from("repair_funds")
        .insert({
          fund_token: randomBytes(24).toString("hex"),
          customer_name: e.customer_name,
          customer_phone: e.customer_phone,
          customer_email: e.customer_email,
          device_summary: [e.device_make, e.device_model].join(" "),
          repair_summary: e.repair_type,
          enquiry_ref: e.enquiry_ref,
          target_amount_pence: r.total,
          quote_version: e.quote_version,
        })
        .select("*")
        .single();
      if (created.error?.code === "23505")
        fund = await checked(
          db
            .from("repair_funds")
            .select("*")
            .eq("enquiry_ref", e.enquiry_ref)
            .in("status", ["open", "funded"])
            .single(),
        );
      else if (created.error) throw Error(created.error.message);
      else fund = created.data;
    }
    if (
      fund.quote_version !== e.quote_version ||
      fund.target_amount_pence !== r.total
    ) {
      if (!r.record.quote_confirmed_at)
        throw Error("Ask us to reconfirm the changed price before saving more");
      fund = await checked(
        db
          .from("repair_funds")
          .update({
            target_amount_pence: r.total,
            quote_version: e.quote_version,
            status: fund.balance_pence >= r.total ? "funded" : "open",
          })
          .eq("id", fund.id)
          .select("*")
          .single(),
      );
    }
    const url = `${siteBase()}/repair-fund/?token=${encodeURIComponent(fund.fund_token)}`;
    const text = `Your savings link for your NFD repair: ${url}\n\nSaving is optional, does not reserve stock or freeze the price. We will reconfirm parts and price before applying your savings. Contact us if you want a refund.`;
    if (process.env.DISABLE_CUSTOMER_MESSAGES !== "true") {
      if (e.customer_phone)
        await sendSms(e.customer_phone, text).catch(() => {});
      if (e.customer_email)
        await sendEmail(
          e.customer_email,
          "Your repair savings link",
          `<p>Your personal repair savings link:</p><p><a href="${url}">View savings</a></p><p>Saving does not reserve stock or freeze prices. We will reconfirm before applying savings.</p>`,
          text,
        );
    }
    return NextResponse.json({ fund_url: url }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409, headers });
  }
}
