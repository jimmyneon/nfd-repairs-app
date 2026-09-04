import { createClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'

const VALID_TOKEN = /^[a-zA-Z0-9-]{10,64}$/

/**
 * Legacy onboarding links now use the single, maintained completion form.
 * The lookup happens on the server so public browsers never query jobs directly.
 * The onboarding_token column was never added to production, so we look up
 * by tracking_token instead — the intake form uses the same token.
 */
export default async function LegacyOnboardingPage({ params }: { params: { token: string } }) {
  if (!VALID_TOKEN.test(params.token)) notFound()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: job } = await supabase
    .from('jobs')
    .select('tracking_token')
    .eq('tracking_token', params.token)
    .single()

  if (!job?.tracking_token) notFound()
  redirect(`/walk-in/complete/${encodeURIComponent(job.tracking_token)}`)
}
