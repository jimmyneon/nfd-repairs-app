import { createServiceClient } from '@/lib/resilience'
import { isTrackingLinkExpired } from '@/lib/job-utils'
import TrackingPageClient from './TrackingPageClient'

/**
 * Server component for /t/[token].
 *
 * SECURITY: The [token] in the URL may be a short cosmetic token (6-8 chars,
 * 24-bit) used for short links, or the full long tracking_token (UUID or
 * 64-char hex). Short tokens are too weak to serve as a capability key, so
 * this server component resolves the short token to the full long
 * tracking_token using the service role before passing it to the client
 * component. The client and the /api/tracking/[token] endpoint only ever
 * use the long token as the authority — never the short token.
 */
export default async function TrackingPage({ params }: { params: { token: string } }) {
  const rawToken = params.token
  if (!rawToken || rawToken.length < 4 || rawToken.length > 64) {
    return <InvalidLink />
  }

  const supabase = createServiceClient()

  // Look up the job by the long tracking_token first (most common case —
  // the URL already contains the long token).
  let { data: job } = await supabase
    .from('jobs')
    .select('tracking_token, short_token, tracking_link_expires_at')
    .eq('tracking_token', rawToken)
    .maybeSingle()

  // If not found by long token, try resolving via short_token → long token.
  // The short token is a cosmetic redirect, NOT the authority.
  if (!job) {
    const { data: shortJob } = await supabase
      .from('jobs')
      .select('tracking_token, short_token, tracking_link_expires_at')
      .eq('short_token', rawToken)
      .maybeSingle()
    if (shortJob) {
      job = shortJob
    }
  }

  if (!job || !job.tracking_token) {
    return <InvalidLink />
  }

  if (isTrackingLinkExpired(job.tracking_link_expires_at)) {
    return <ExpiredLink />
  }

  // Pass the LONG tracking_token as the authority; the short_token is only
  // used for cosmetic QR code display.
  return (
    <TrackingPageClient
      resolvedToken={job.tracking_token}
      shortToken={job.short_token || job.tracking_token}
    />
  )
}

function InvalidLink() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Tracking link not found</h1>
        <p className="text-gray-600 dark:text-gray-400">This tracking link is invalid or has been removed.</p>
      </div>
    </div>
  )
}

function ExpiredLink() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Tracking link expired</h1>
        <p className="text-gray-600 dark:text-gray-400">This tracking link has expired. Please contact us for an updated link.</p>
      </div>
    </div>
  )
}
