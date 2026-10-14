import { NextRequest, NextResponse } from "next/server";
import { requireStaffUser } from "@/lib/api-auth";
import { createServiceClient } from "@/lib/resilience";
import { checked, journeyUrl } from "@/lib/repair-journey";
import {
  completeTotal,
  pence,
  snapshot,
  quoteFingerprint,
} from "@/lib/quote-pricing";
import {
  confirmationText,
  enqueueRepairMessage,
  deliverRepairMessages,
} from "@/lib/repair-messages";
export async function POST(req: NextRequest) {
  const auth = await requireStaffUser(req);
  if (auth.response) return auth.response;
  const db = createServiceClient();
  try {
    const body = await req.json();
    const e: any = await checked(
      db.from("enquiries").select("*").eq("id", body.enquiry_id).single(),
    );
    if (
      ![
        "in_stock",
        "parts_needed",
        "parts_deposit_paid",
        "device_in_shop",
      ].includes(body.stock_status)
    )
      throw Error("Choose stock availability");
    if (!e.customer_phone && !e.customer_email)
      throw Error("Add a mobile number or email");
    if (!e.quote_action_token)
      throw Error("Send a secure quote link before confirmation");
    const original = snapshot(e),
      total =
        body.confirmed_total != null
          ? pence(body.confirmed_total)
          : completeTotal(e);
    if (total <= 0)
      throw Error("Enter the complete confirmed repair price first");
    const extras = [
      ...(e.additional_repairs || []),
      ...(e.accessories || []),
    ].reduce((s: number, x: any) => s + pence(x.price), 0);
    if (total < extras) throw Error("Total cannot be lower than extras");
    const confirmed = {
      ...e,
      quoted_price: (total - extras) / 100,
      part_option: body.part_option || e.part_option,
      device_colour: body.device_colour || e.device_colour,
    };
    const confirmedSnapshot = snapshot(confirmed),
      changed =
        Boolean(e.price_confirmation_required) || quoteFingerprint(original) !== quoteFingerprint(confirmedSnapshot);
    const parts =
      body.stock_status === "parts_needed" ||
      body.stock_status === "parts_deposit_paid";
    const deposit = parts
      ? Math.min(pence(body.deposit_amount ?? 20), total) / 100
      : null;
    if (parts && (!deposit || deposit < 0))
      throw Error("Enter a valid ordering deposit");
    const data = {
      customer_name: e.customer_name,
      customer_phone: e.customer_phone,
      customer_email: e.customer_email,
      tracking_token: crypto.randomUUID(),
      device_type: e.device_category,
      device_make: e.device_make,
      device_model: e.device_model,
      device_colour: confirmed.device_colour,
      part_option: confirmed.part_option,
      issue: e.repair_type,
      description: e.issue_description,
      type: "repair",
      source: "enquiry_conversion",
      quoted_price: confirmed.quoted_price,
      price_total: total / 100,
      additional_issues: [
        ...(e.additional_repairs || []),
        ...(e.accessories || []).map((a: any) => ({
          repair:
            "accessory_" + a.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          display_name: a.name,
          price: a.price,
          option_type: "accessory",
        })),
      ],
      requires_parts_order: parts,
      parts_required: parts,
      deposit_required: parts,
      deposit_amount: deposit,
      deposit_received: false,
      payment_received: false,
      parts_expected_at:
        parts && body.earliest_date
          ? new Date(body.earliest_date + "T12:00:00Z").toISOString()
          : null,
      confirmation_notes: String(body.staff_notes || "").slice(0, 2000),
      device_in_shop: body.stock_status === "device_in_shop",
      status: changed
        ? "AWAITING_CUSTOMER"
        : parts
          ? "AWAITING_DEPOSIT"
          : body.stock_status === "device_in_shop"
            ? "RECEIVED"
            : "AWAITING_DEVICE",
      terms_accepted: e.terms_accepted || false,
      quote_request_id: e.id,
    };
    const job: any = await checked(
      db.rpc("confirm_repair_enquiry", {
        p_enquiry: e.id,
        p_job: data,
        p_snapshot: confirmedSnapshot,
        p_changed: changed,
      }),
    );
    await enqueueRepairMessage(
      db,
      job,
      "confirmed:" +
        quoteFingerprint({
          parts: job.requires_parts_order,
          arrival: job.parts_expected_at,
          notes: job.confirmation_notes,
        }),
      confirmationText(job, e),
    );
    const messages = await deliverRepairMessages(db, job.id);
    return NextResponse.json({
      success: true,
      job_id: job.id,
      job_ref: job.job_ref,
      status: job.status,
      tracking_url: journeyUrl(e.enquiry_ref, e.quote_action_token),
      ...messages,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }
}
