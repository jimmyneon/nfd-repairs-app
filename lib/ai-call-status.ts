/**
 * Poll AI Desk for the live status of an outbound AI call so staff get real
 * feedback: ringing → on the call → finished / couldn't get through.
 * Returns a stop() function.
 */
export type AiCallStatusUpdate = {
  state?: 'ringing' | 'in_call' | 'completed' | 'unreachable' | 'unknown'
  outcome?: string | null
  unreachableReason?: string | null
}

export function pollAiCallStatus(
  sid: string,
  onUpdate: (d: AiCallStatusUpdate) => void,
  maxTicks = 40 // ~3.5 min at 5s intervals
) {
  let ticks = 0
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const tick = async () => {
    if (stopped) return
    ticks++
    try {
      const r = await fetch(`/api/ai-desk/call-status?sid=${encodeURIComponent(sid)}`)
      const d = (await r.json()) as AiCallStatusUpdate
      onUpdate(d)
      if (d.state === 'completed' || d.state === 'unreachable') return
    } catch {
      // transient — keep polling
    }
    if (ticks < maxTicks && !stopped) {
      timer = setTimeout(tick, 5000)
    }
  }

  timer = setTimeout(tick, 4000)
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

export function describeAiCallStatus(d: AiCallStatusUpdate, name: string): string {
  switch (d.state) {
    case 'ringing':
      return `Ringing ${name}...`
    case 'in_call':
      return `Alex is on the call with ${name} now...`
    case 'completed':
      return `Call finished${d.outcome ? ` — ${d.outcome}` : ''}.`
    case 'unreachable':
      return `${d.unreachableReason || "Couldn't get through"} — press the button to try again.`
    default:
      return ''
  }
}
