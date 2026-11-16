import { SupabaseClient } from '@supabase/supabase-js'
import { phoneLookupVariants } from '@/lib/phone-lookup'

/**
 * Link open repair_quote enquiries to an existing job.
 *
 * Used when a job already exists for a customer (e.g. staff created one
 * manually) but an old open enquiry is still hanging around — replies should
 * land on the job, not auto-convert the stale enquiry into a duplicate job.
 *
 * An enquiry is linked when it was explicitly named (opts.enquiryId or the
 * job's quote_request_id) or when its device_model matches the job's
 * (case-insensitive, trimmed).
 *
 * Never throws — returns the enquiry refs that were linked, [] on error.
 */
export async function linkOpenEnquiriesToJob(
  supabase: SupabaseClient<any, any, any>,
  job: {
    id: string
    job_ref: string
    customer_phone: string
    device_model?: string | null
    quote_request_id?: string | null
  },
  opts?: { enquiryId?: string }
): Promise<string[]> {
  try {
    const phones = phoneLookupVariants(job.customer_phone)
    const { data: enquiries, error } = await supabase
      .from('enquiries')
      .select('id, enquiry_ref, device_model')
      .eq('enquiry_type', 'repair_quote')
      .in('status', ['pending', 'approved', 'more_info_requested'])
      .is('converted_job_id', null)
      .in('customer_phone', phones)

    if (error) throw error
    if (!enquiries || enquiries.length === 0) return []

    const jobModel = (job.device_model || '').trim().toLowerCase()
    const now = new Date().toISOString()
    const linkedRefs: string[] = []
    const linkedIds: string[] = []

    for (const enquiry of enquiries) {
      const modelMatch =
        jobModel.length > 0 &&
        (enquiry.device_model || '').trim().toLowerCase() === jobModel
      const explicit =
        enquiry.id === opts?.enquiryId || enquiry.id === job.quote_request_id
      if (!modelMatch && !explicit) continue

      await supabase
        .from('enquiries')
        .update({
          status: 'converted',
          converted_job_id: job.id,
          converted_to_job: true,
          converted_at: now,
          updated_at: now,
        })
        .eq('id', enquiry.id)

      await supabase.from('job_events').insert({
        job_id: job.id,
        type: 'SYSTEM',
        message: `Linked open enquiry ${enquiry.enquiry_ref} to this job`,
      })

      linkedRefs.push(enquiry.enquiry_ref)
      linkedIds.push(enquiry.id)
    }

    if (!job.quote_request_id && linkedIds.length > 0) {
      await supabase
        .from('jobs')
        .update({ quote_request_id: linkedIds[0] })
        .eq('id', job.id)
    }

    return linkedRefs
  } catch (e) {
    console.error('[enquiry-linking] Failed to link open enquiries to job:', e)
    return []
  }
}
