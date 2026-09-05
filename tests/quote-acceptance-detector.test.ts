import { describe, it, expect } from 'vitest'
import { detectQuoteAcceptance, isQuoteInquiry } from '@/lib/quote-acceptance-detector'

describe('detectQuoteAcceptance', () => {
  describe('high-confidence acceptance (auto-convert)', () => {
    const acceptCases = [
      'yes',
      'Yes',
      'YES',
      'yes please',
      'yeah',
      'yep',
      'sure',
      'go ahead',
      'Go ahead please',
      'please go ahead',
      'proceed',
      'book it in',
      'book me in',
      "let's do it",
      "I'll take it",
      'accept',
      'confirmed',
      'I want to proceed',
      'I want to book',
      'when can I drop it off',
      'when can I bring it in',
      "I'll bring it in",
      "I'll drop it off",
      'yes I want this',
      "yes I'd like that",
      'please book me in',
    ]

    for (const msg of acceptCases) {
      it(`"${msg}" → accept (confidence 0.9, no confirmation needed)`, () => {
        const result = detectQuoteAcceptance(msg)
        expect(result.isAcceptance).toBe(true)
        expect(result.confidence).toBe(0.9)
        expect(result.needsConfirmation).toBe(false)
        expect(result.classification).toBe('accept')
      })
    }
  })

  describe('medium confidence (send confirm prompt)', () => {
    const mediumCases = [
      'ok',
      'okay',
      'perfect',
      'great',
      'brilliant',
      'lovely',
      'thanks',
      'thank you',
      'sounds good',
      "that's fine",
      "that's perfect",
      "that's great",
      'happy with that',
      "I'm happy",
    ]

    for (const msg of mediumCases) {
      it(`"${msg}" → medium (confidence 0.6, needs confirmation)`, () => {
        const result = detectQuoteAcceptance(msg)
        expect(result.isAcceptance).toBe(true)
        expect(result.confidence).toBe(0.6)
        expect(result.needsConfirmation).toBe(true)
        expect(result.classification).toBe('medium')
      })
    }
  })

  describe('high-confidence rejection', () => {
    const declineCases = [
      'no',
      'nope',
      'nah',
      'no thanks',
      'not now',
      'not right now',
      'too expensive',
      'too much',
      "can't afford",
      "I'll think about it",
      'let me think',
      'maybe later',
      'no way',
      'forget it',
    ]

    for (const msg of declineCases) {
      it(`"${msg}" → decline (confidence 0.9)`, () => {
        const result = detectQuoteAcceptance(msg)
        expect(result.isAcceptance).toBe(false)
        expect(result.confidence).toBe(0.9)
        expect(result.needsConfirmation).toBe(false)
        expect(result.classification).toBe('decline')
      })
    }
  })

  describe('unclear messages', () => {
    const unclearCases = [
      'what time do you close?',
      'do you fix Samsung phones?',
      'my screen is cracked but I want to know if you can fix it today',
      'hello',
      '',
      'can I get a discount?',
      'where are you located?',
    ]

    for (const msg of unclearCases) {
      it(`"${msg}" → unclear`, () => {
        const result = detectQuoteAcceptance(msg)
        expect(result.isAcceptance).toBe(null)
        expect(result.confidence).toBe(0)
        expect(result.classification).toBe('unclear')
      })
    }
  })

  describe('edge cases', () => {
    it('trims whitespace before matching', () => {
      expect(detectQuoteAcceptance('  yes  ').classification).toBe('accept')
      expect(detectQuoteAcceptance('\n\nok\n').classification).toBe('medium')
    })

    it('is case-insensitive', () => {
      expect(detectQuoteAcceptance('YES').classification).toBe('accept')
      expect(detectQuoteAcceptance('Ok').classification).toBe('medium')
      expect(detectQuoteAcceptance('NO').classification).toBe('decline')
    })

    it('"yes" with extra words after still matches high confidence', () => {
      expect(detectQuoteAcceptance('yes I want to proceed').classification).toBe('accept')
    })

    it('"no thanks" is decline, not unclear', () => {
      expect(detectQuoteAcceptance('no thanks').classification).toBe('decline')
    })
  })
})

describe('isQuoteInquiry', () => {
  it('returns true for price questions', () => {
    expect(isQuoteInquiry('how much for a screen?')).toBe(true)
    expect(isQuoteInquiry("what's the price?")).toBe(true)
  })

  it('returns true for repair/quote mentions', () => {
    expect(isQuoteInquiry('do you do repairs?')).toBe(true)
    expect(isQuoteInquiry('can I get a quote?')).toBe(true)
  })

  it('returns true for timing questions', () => {
    expect(isQuoteInquiry('how long does it take?')).toBe(true)
    expect(isQuoteInquiry('when will it be ready?')).toBe(true)
  })

  it('returns false for acceptances and declines', () => {
    expect(isQuoteInquiry('yes')).toBe(false)
    expect(isQuoteInquiry('no')).toBe(false)
  })

  it('returns false for unrelated messages', () => {
    expect(isQuoteInquiry('hello')).toBe(false)
    expect(isQuoteInquiry('')).toBe(false)
  })
})
