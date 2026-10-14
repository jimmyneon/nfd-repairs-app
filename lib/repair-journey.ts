import { isQuoteActionTokenValid } from "./job-utils";
import { completeTotal } from "./quote-pricing";
import { createServiceClient } from "./resilience";

export const siteBase = () =>
  (
    process.env.NEXT_PUBLIC_SITE_URL || "https://newforestdevicerepairs.co.uk"
  ).replace(/\/+$/, "");
export function journeyUrl(ref: string, token: string) {
  return `${siteBase()}/repair-quote/?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(token)}`;
}
export async function checked<T = any>(query: any): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
export async function resolveRepair(
  db: ReturnType<typeof createServiceClient>,
  ref: string,
  token: string,
  tracking = false,
) {
  if (!/^[\w-]{4,100}$/.test(ref)) throw new Error("Invalid repair link");
  let enquiry: any = null,
    job: any = null;
  if (tracking) {
    job = await checked(
      db
        .from("jobs")
        .select("*")
        .or(`tracking_token.eq.${ref},short_token.eq.${ref}`)
        .maybeSingle(),
    );
    if (job)
      enquiry = await checked(
        db
          .from("enquiries")
          .select("*")
          .eq("converted_job_id", job.id)
          .maybeSingle(),
      );
  } else {
    enquiry = await checked(
      db.from("enquiries").select("*").eq("enquiry_ref", ref).maybeSingle(),
    );
    if (enquiry?.converted_job_id)
      job = await checked(
        db.from("jobs").select("*").eq("id", enquiry.converted_job_id).single(),
      );
    if (!enquiry)
      job = await checked(
        db.from("jobs").select("*").eq("id", ref).maybeSingle(),
      );
    const auth = enquiry || job;
    if (
      !auth?.quote_action_token ||
      token !== auth.quote_action_token ||
      !isQuoteActionTokenValid(
        token,
        auth.quote_action_token_expires_at,
        auth.quote_action_token_revoked_at,
      )
    )
      throw new Error("Invalid or expired repair link");
  }
  const record = job || enquiry;
  if (!record) throw new Error("Repair not found");
  const money: any = await checked(
    db.rpc("repair_money", {
      p_job: job?.id || null,
      p_ref: enquiry?.enquiry_ref || null,
    }),
  );
  return {
    job,
    enquiry,
    record,
    money,
    total: completeTotal(record),
    ref: enquiry?.enquiry_ref || job.id,
  };
}
export function paymentAllowed(record: any) {
  return Boolean(
    record.quote_confirmed_at &&
    record.quote_accepted_version === record.quote_version &&
    record.price_total > 0 &&
    !["CANCELLED", "cancelled", "rejected", "COLLECTED", "COMPLETED"].includes(
      record.status,
    ),
  );
}
