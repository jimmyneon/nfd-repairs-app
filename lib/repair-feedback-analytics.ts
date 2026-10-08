type Event = { session_id: string; enquiry_ref?: string | null; event_type: string; event_data?: Record<string, any> | null; created_at: string }
type Enquiry = { id: string; enquiry_ref: string }
type Job = { id: string; quote_request_id?: string | null; status?: string; device_in_shop?: boolean | null; price_total?: number | string | null; payment_received?: boolean | null }
const CAMPAIGN = 'october-2026-price-help-v1'
export function repairFeedbackAnalytics(events: Event[], enquiries: Enquiry[], jobs: Job[]) {
  const relevant = events.filter(e => e.event_data?.campaign === CAMPAIGN && !e.event_data?.test_mode)
  const exposures = new Map<string, Event>()
  for (const event of [...relevant].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (event.event_type === 'repair_feedback_prompt_shown' && event.event_data?.eligible
      && ['offer', 'control'].includes(event.event_data?.variant) && !exposures.has(event.session_id)) exposures.set(event.session_id, event)
  }
  const reasons = new Map<string, string>()
  for (const event of relevant) if (event.event_type === 'repair_feedback_answer' && typeof event.event_data?.reason === 'string') reasons.set(event.session_id, event.event_data.reason)
  const reasonCounts: Record<string, number> = {}
  for (const reason of reasons.values()) reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
  const enquiryByRef = new Map(enquiries.map(e => [e.enquiry_ref, e]))
  const groups = ['control', 'offer'].map(variant => {
    const sessions = [...exposures].filter(([, event]) => event.event_data?.variant === variant).map(([session]) => session)
    const sessionSet = new Set(sessions)
    const cohortEvents = relevant.filter(e => sessionSet.has(e.session_id))
    const saved = cohortEvents.filter(e => e.event_type === 'repair_experiment_request_saved')
    const ids = new Set(saved.map(e => enquiryByRef.get(e.enquiry_ref || '')?.id).filter(Boolean))
    const cohortJobs = jobs.filter(j => ids.has(j.quote_request_id || ''))
    const completed = cohortJobs.filter(j => ['COLLECTED', 'COMPLETED'].includes(j.status || ''))
    const arrived = cohortJobs.filter(j => j.device_in_shop || ['RECEIVED', 'IN_REPAIR', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED'].includes(j.status || ''))
    const discountedRefs = new Set(saved.filter(e => e.event_data?.discount_applied).map(e => e.enquiry_ref))
    const discountIds = new Set([...discountedRefs].map(ref => enquiryByRef.get(ref || '')?.id).filter(Boolean))
    const completedDiscounts = completed.filter(j => discountIds.has(j.quote_request_id || '')).length
    const visitorCount = (type: string) => new Set(cohortEvents.filter(e => e.event_type === type).map(e => e.session_id)).size
    return { variant, visitors: sessions.length, price_concerns: sessions.filter(s => reasons.get(s) === 'price').length,
      offers_shown: visitorCount('repair_discount_shown'), offers_claimed: visitorCount('repair_discount_claimed'),
      requests: new Set(saved.map(e => e.enquiry_ref).filter(Boolean)).size, arrived: arrived.length,
      completed: completed.length, payment_marked: completed.filter(j => j.payment_received === true).length,
      completed_value: Math.round(completed.reduce((sum, j) => sum + (Number(j.price_total) || 0), 0) * 100) / 100,
      completed_discount_cost: completedDiscounts * 5 }
  })
  return { campaign: CAMPAIGN, reasons: Object.entries(reasonCounts).map(([reason, visitors]) => ({ reason, visitors })), groups,
    prompted: new Set(relevant.filter(e => e.event_type === 'repair_feedback_prompt_shown').map(e => e.session_id)).size,
    answers: reasons.size, observed_exits: new Set(relevant.filter(e => e.event_type === 'repair_quote_left').map(e => e.session_id)).size }
}
