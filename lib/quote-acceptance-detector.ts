/**
 * Quote Acceptance Detector
 *
 * Detects when a customer wants to accept, decline, or ask about a repair quote
 * based on their inbound SMS reply. Uses regex patterns only — no AI, no API
 * calls, no latency. This replaces the old AI Steve conversational layer with
 * a simple deterministic classifier.
 *
 * Three outcomes:
 *   - High-confidence acceptance  → auto-convert enquiry to job
 *   - Medium-confidence           → send "Reply YES to confirm" prompt
 *   - High-confidence rejection   → mark enquiry rejected, send polite close-out
 *   - Unclear                     → log as a note on the enquiry for staff review
 */

export type AcceptanceResult = {
  /** true = customer wants to proceed, false = decline, null = unclear */
  isAcceptance: boolean | null
  /** 0-1 confidence in the classification */
  confidence: number
  /** true if we should ask for explicit confirmation before booking */
  needsConfirmation: boolean
  /** Human-readable label for logging */
  classification: 'accept' | 'medium' | 'decline' | 'unclear'
}

/**
 * Check if a customer's SMS reply indicates they want to accept/proceed with
 * a quote, decline it, or something ambiguous.
 */
export function detectQuoteAcceptance(message: string): AcceptanceResult {
  const lower = message.toLowerCase().trim()

  // -------------------------------------------------------------------------
  // High-confidence acceptance — auto-convert to job
  // -------------------------------------------------------------------------
  const highAcceptancePatterns = [
    /^yes\s*please$/i,
    /^yes$/i,
    /^yeah$/i,
    /^yep$/i,
    /^sure$/i,
    /^please\s+go\s+ahead$/i,
    /^please\s+book\s+(me\s+)?in$/i,
    /go\s+ahead/i,
    /\bproceed\b/i,
    /book\s+(it\s+)?in/i,
    /book\s+me\s+in/i,
    /get\s+it\s+booked/i,
    /let'?s\s+do\s+it/i,
    /i'?ll\s+take\s+it/i,
    /\baccept\b/i,
    /^confirmed?$/i,
    /i\s+want\s+to\s+(go\s+ahead|proceed|book)/i,
    /when\s+can\s+(i\s+)?(drop\s+it\s+off|bring\s+it\s+in)/i,
    /i'?ll\s+bring\s+it\s+in/i,
    /i'?ll\s+drop\s+it\s+off/i,
    /yes\s+i\s+want/i,
    /yes\s+i'?d\s+like/i,
  ]

  for (const pattern of highAcceptancePatterns) {
    if (pattern.test(lower)) {
      return {
        isAcceptance: true,
        confidence: 0.9,
        needsConfirmation: false,
        classification: 'accept',
      }
    }
  }

  // -------------------------------------------------------------------------
  // Medium confidence — send "Reply YES to confirm" prompt
  // -------------------------------------------------------------------------
  const mediumPatterns = [
    /^ok$/i,
    /^okay$/i,
    /^perfect$/i,
    /^great$/i,
    /^brilliant$/i,
    /^lovely$/i,
    /^thanks$/i,
    /^thank\s+you$/i,
    /sounds\s+good/i,
    /that'?s\s+fine/i,
    /that'?s\s+perfect/i,
    /that'?s\s+great/i,
    /happy\s+with\s+that/i,
    /i'?m\s+happy/i,
  ]

  for (const pattern of mediumPatterns) {
    if (pattern.test(lower)) {
      return {
        isAcceptance: true,
        confidence: 0.6,
        needsConfirmation: true,
        classification: 'medium',
      }
    }
  }

  // -------------------------------------------------------------------------
  // High-confidence rejection — mark enquiry rejected
  // -------------------------------------------------------------------------
  const rejectionPatterns = [
    /^no$/i,
    /^nope$/i,
    /^nah$/i,
    /no\s+thanks/i,
    /not\s+(right\s+)?now/i,
    /too\s+(expensive|much|dear)/i,
    /can'?t\s+afford/i,
    /i'?ll\s+think\s+about\s+it/i,
    /let\s+me\s+think/i,
    /maybe\s+later/i,
    /no\s+way/i,
    /forget\s+it/i,
  ]

  for (const pattern of rejectionPatterns) {
    if (pattern.test(lower)) {
      return {
        isAcceptance: false,
        confidence: 0.9,
        needsConfirmation: false,
        classification: 'decline',
      }
    }
  }

  // -------------------------------------------------------------------------
  // Unclear — log for staff review
  // -------------------------------------------------------------------------
  return {
    isAcceptance: null,
    confidence: 0,
    needsConfirmation: false,
    classification: 'unclear',
  }
}

/**
 * Check if message is asking about the quote or repair (rather than
 * accepting/declining). Useful to decide whether to log as a staff-followup
 * note vs. an acceptance attempt.
 */
export function isQuoteInquiry(message: string): boolean {
  const lower = message.toLowerCase().trim()
  const inquiryPatterns = [
    /how\s+much/i,
    /what'?s\s+the\s+(price|cost|quote)/i,
    /\bquote\b/i,
    /\brepairs?\b/i,
    /when\s+(can|will)\s+(you|it\s+be)/i,
    /how\s+long/i,
    /turnaround/i,
    /\bready\b/i,
  ]
  return inquiryPatterns.some((pattern) => pattern.test(lower))
}
