export const dynamic = "force-dynamic";
import { loadQuoteCatalogue } from "@/lib/quote-pricing";
import {
  getAvailableAddOns,
  getAvailableAccessories,
} from "@/lib/public-quote-options";
import { shortFastDropoffLink } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/resilience";
import { corsHeaders } from "@/lib/api-auth";
import {
  checked,
  resolveRepair,
  paymentAllowed,
  siteBase,
} from "@/lib/repair-journey";
import { checkRateLimit, getClientIP } from "@/lib/rate-limit";
import { closeUnpaidCheckout } from "@/lib/payment-reconciliation";
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req) });
}
async function resource(req: NextRequest) {
  if (!(await checkRateLimit(getClientIP(req), "repair-journey", 30)).allowed)
    throw Error("Too many requests");
  return resolveRepair(
    createServiceClient(),
    (req.nextUrl.searchParams.get("ref") || "").replace(/\/.*$/, ""),
    req.nextUrl.searchParams.get("t") || "",
  );
}
export async function GET(req: NextRequest) {
  const headers = corsHeaders(req);
  try {
    const r = await resource(req),
      e = r.enquiry,
      j = r.job,
      v = r.record;
    const c = await loadQuoteCatalogue();
    const catalogue = Object.assign(c.quotes, {
      policy: c.serviceGuidance,
      accessories: c.accessories,
    });
    const context = {
      category: e?.device_category || j?.device_type,
      brand: v.device_make,
      model: v.device_model,
      primaryRepair: e?.repair_type || j?.issue,
    };
    return NextResponse.json(
      {
        available_addons: getAvailableAddOns(
          catalogue,
          context,
          e?.additional_repairs || [],
        ),
        available_accessories: getAvailableAccessories(
          context,
          catalogue,
        ).filter(
          (a) => !(e?.accessories || []).some((x: any) => x.name === a.name),
        ),
        preferred_dropoff: e?.dropoff_date || e?.dropoff_preference || null,
        requested: Boolean(e && ["approved", "converted"].includes(e.status)),
        reference: j?.job_ref || e.enquiry_ref,
        status: v.status,
        confirmed: Boolean(v.quote_confirmed_at),
        needs_acceptance: Boolean(
          v.quote_confirmed_at && v.quote_accepted_version !== v.quote_version,
        ),
        quote_version: v.quote_version,
        quote: (v.quote_confirmed_at && v.quote_snapshot) || {
          device: [v.device_make, v.device_model].join(" "),
          repair: v.repair_type || v.issue,
          part_option: v.part_option,
          colour: v.device_colour,
          primary_price: v.quoted_price,
          additional_repairs: e?.additional_repairs || [],
          accessories: e?.accessories || [],
          total_pence: r.total,
        },
        ...r.money,
        can_pay: paymentAllowed(v) && (e?.customer_response || v.customer_response) !== "cancel",
        requires_parts_order: Boolean(v.requires_parts_order),
        part_arrival: v.parts_expected_at || null,
        repair_time: e?.estimated_time || null,
        notes: v.confirmation_notes || "",
        fast_dropoff_url:
          j &&
          !j.terms_accepted &&
          ["AWAITING_DEVICE", "PARTS_ARRIVED"].includes(j.status)
            ? shortFastDropoffLink(j.tracking_token)
            : null,
        pay_token: j?.short_token || j?.tracking_token || null,
        price_available: r.total > 0,
        fund_allowed: Boolean(
          (e?.price_verified || e?.quote_confirmed_at) && e?.quoted_price > 0,
        ),
        customer_response: e?.customer_response || v.customer_response || null,
      },
      { headers },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "This repair link is unavailable or expired. Please contact us for a new link.",
      },
      { status: 403, headers },
    );
  }
}
export async function POST(req: NextRequest) {
  const headers = corsHeaders(req);
  try {
    const r = await resource(req),
      body = await req.json(),
      db = createServiceClient();
    if (body.action === "request") {
      if (!r.enquiry || r.job)
        throw Error("This repair request is already being processed");
      if (["cancelled", "rejected"].includes(r.enquiry.status) || r.enquiry.customer_response === "cancel")
        throw Error("The shop must review this cancellation before starting the repair");
      if (r.enquiry.status === "approved") return NextResponse.json({success: true}, {headers});
      await checked(
        db
          .from("enquiries")
          .update({
            status: "approved",
            proceed_with_repair: true,
            customer_response: "requested",
          })
          .eq("id", r.enquiry.id),
      );
      await checked(
        db.from("notifications").insert({
          type: "ACTION_REQUIRED",
          title: "Repair requested",
          body: r.ref + " — check parts and confirm",
          is_read: false,
        }),
      );
    } else if (body.action === "accept") {
      if (
        !r.job?.quote_confirmed_at ||
        Number(body.version) !== r.record.quote_version
      )
        throw Error("Repair details changed; refresh before accepting");
      await checked(
        db.rpc("accept_repair_quote", {
          p_job: r.job.id,
          p_version: Number(body.version),
        }),
      );
    } else if (["timing", "question", "cancel"].includes(body.action)) {
      const note = String(body.note || "")
        .trim()
        .slice(0, 1500);
      await checked(
        db
          .from(r.enquiry ? "enquiries" : "jobs")
          .update({ customer_response: body.action })
          .eq("id", r.enquiry?.id || r.job.id),
      );
      if (body.action === "cancel" && r.job)
        await checked(
          db
            .from("jobs")
            .update({ quote_accepted_version: null, customer_response: "cancel" })
            .eq("id", r.job.id),
        );
      if (body.action === "cancel") {
        const filters = [r.job ? `job_id.eq.${r.job.id}` : "", r.enquiry ? `enquiry_ref.eq.${r.enquiry.enquiry_ref}` : ""].filter(Boolean).join(",");
        const pending: any[] = await checked(db.from("payments").select("*").or(filters).in("status", ["open", "creating"]));
        for (const row of pending) {
          try { await closeUnpaidCheckout(db, row); }
          catch {
            await checked(db.from("notifications").insert({ type: "ACTION_REQUIRED", title: "Review checkout after cancellation", body: `${r.ref}: check pending provider payment ${row.id} before confirming refund/cancellation.`, job_id: r.job?.id || null, is_read: false }));
          }
        }
      }
      await checked(
        db.from("notifications").insert({
          type: "ACTION_REQUIRED",
          title: "Customer response",
          body: `${r.ref}: ${body.action}${note ? " — " + note : ""}`,
          job_id: r.job?.id || null,
          is_read: false,
        }),
      );
      // Cancellation requires staff review of money/order state; no automatic refund or lost order.
    } else throw Error("Invalid action");
    return NextResponse.json({ success: true }, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409, headers });
  }
}
