import { checked, journeyUrl } from "./repair-journey";
import { sendSms, createServiceClient } from "./resilience";
import { sendEmail } from "./email";

export async function enqueueRepairMessage(
  db: ReturnType<typeof createServiceClient>,
  job: any,
  key: string,
  text: string,
) {
  for (const [channel, recipient] of [
    ["sms", job.customer_phone],
    ["email", job.customer_email],
  ]) {
    if (recipient)
      await checked(
        db
          .from("repair_message_outbox")
          .upsert(
            {
              dedupe_key: `${job.id}:${job.quote_version}:${key}:${channel}`,
              job_id: job.id,
              channel,
              recipient,
              body: text,
            },
            { onConflict: "dedupe_key", ignoreDuplicates: true },
          ),
      );
  }
}
export async function deliverRepairMessages(
  db: ReturnType<typeof createServiceClient>,
  jobId?: string,
) {
  const rows: any[] = await checked(
    db.rpc("claim_repair_messages", { p_job: jobId || null }),
  );
  const result = {
    sms_sent: false,
    email_sent: false,
    customer_notified: false,
  };
  for (const row of rows) {
    let success = false;
    try {
      if (process.env.DISABLE_CUSTOMER_MESSAGES === "true")
        throw new Error("Customer messages disabled");
      if (row.channel === "sms")
        success = (await sendSms(row.recipient, row.body)).ok;
      else {
        const safe = row.body.replace(
          /[&<>"']/g,
          (c: string) =>
            (
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              }) as Record<string, string>
            )[c]!,
        );
        success = (
          await sendEmail(
            row.recipient,
            "Your NFD repair update",
            `<div style="white-space:pre-line;font-family:Arial">${safe}</div>`,
            row.body,
          )
        ).success;
      }
    } catch {
      success = false;
    }
    await checked(
      db
        .from("repair_message_outbox")
        .update({
          status: success ? "sent" : "pending",
          locked_until: null,
          attempts: row.attempts + 1,
          last_error: success ? null : "Delivery failed; retry required",
          sent_at: success ? new Date().toISOString() : null,
        })
        .eq("id", row.id),
    );
    if (success) {
      result.customer_notified = true;
      if (row.channel === "sms") result.sms_sent = true;
      else result.email_sent = true;
    }
  }
  return result;
}
export function confirmationText(job: any, enquiry: any) {
  const url = journeyUrl(enquiry.enquiry_ref, enquiry.quote_action_token);
  const amount = `£${Number(job.price_total).toFixed(2)}`;
  const action =
    job.quote_accepted_version !== job.quote_version
      ? "Please review and accept the updated repair details before we proceed."
      : job.requires_parts_order
        ? `We need to order your part. Pay a £${Number(job.deposit_amount).toFixed(2)} deposit (deducted from your total), or pay the full outstanding amount by card or Klarna where eligible. If already paid, no further deposit is needed.`
        : "Your part is in stock. Bring your device to 5A New Street during opening hours. Pay cash/card on collection, or pay online by card or eligible Klarna if you prefer.";
  return `Hi ${String(job.customer_name || "").split(" ")[0]}! Your ${job.device_make} ${job.device_model} repair total is ${amount}.\n\n${action}\n\n${job.requires_parts_order ? "Ordered parts usually arrive the next working day after ordering, subject to supplier availability and cut-offs. We will confirm when ordered and when they arrive." : ""}${job.parts_expected_at ? `\nExpected part availability: ${new Date(job.parts_expected_at).toLocaleDateString("en-GB", { timeZone: "Europe/London" })}.` : ""}${enquiry.estimated_time ? `\nTypical repair time after drop-off and part arrival: ${enquiry.estimated_time}.` : ""}${job.confirmation_notes ? `\n${job.confirmation_notes}` : ""}\n\nContinue, view payment options or tell us if the timing does not suit you:\n${url}\n\nNFD Repairs`;
}
