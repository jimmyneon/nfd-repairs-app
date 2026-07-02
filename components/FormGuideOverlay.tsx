'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ChevronDown, Check, Hand } from 'lucide-react'

interface GuideStep {
  id: string
  label: string
  filled: boolean
  focusSelector?: string
}

interface FormGuideOverlayProps {
  steps: GuideStep[]
  submitReady: boolean
}

const BAR_HEIGHT = 72
const SAFE_MARGIN_TOP = 60
const INACTIVITY_MS = 2500

export default function FormGuideOverlay({ steps, submitReady }: FormGuideOverlayProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const [viewportTop, setViewportTop] = useState(0)
  const [fieldRect, setFieldRect] = useState<DOMRect | null>(null)
  const [needsScroll, setNeedsScroll] = useState(false)
  const [showNudge, setShowNudge] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const lastInteractionRef = useRef(Date.now())
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentStep = steps[activeIndex]

  const measureViewport = useCallback(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    if (vv) {
      setViewportHeight(vv.height)
      setViewportTop(vv.offsetTop)
    } else {
      setViewportHeight(window.innerHeight)
      setViewportTop(0)
    }
  }, [])

  const measureField = useCallback(() => {
    if (submitReady || dismissed || !currentStep) {
      setFieldRect(null)
      setNeedsScroll(false)
      return
    }

    const el = document.getElementById(currentStep.id)
    if (!el) {
      setFieldRect(null)
      setNeedsScroll(false)
      return
    }

    const rect = el.getBoundingClientRect()
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const vh = vv ? vv.height : window.innerHeight
    const vTop = vv ? vv.offsetTop : 0

    const safeBottom = vTop + vh - BAR_HEIGHT - 16
    const safeTop = vTop + SAFE_MARGIN_TOP

    if (rect.bottom < safeTop || rect.top > safeBottom || rect.top < safeTop) {
      setNeedsScroll(true)
    } else {
      setNeedsScroll(false)
    }
    setFieldRect(rect)
  }, [currentStep, submitReady, dismissed])

  const scrollToField = useCallback(() => {
    if (!currentStep) return
    const el = document.getElementById(currentStep.id)
    if (!el) return

    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const vh = vv ? vv.height : window.innerHeight

    const rect = el.getBoundingClientRect()
    const targetCenter = rect.top + rect.height / 2
    const desiredCenter = SAFE_MARGIN_TOP + (vh - BAR_HEIGHT - SAFE_MARGIN_TOP) / 2
    const scrollDelta = targetCenter - desiredCenter

    if (Math.abs(scrollDelta) > 10) {
      window.scrollBy({ top: scrollDelta, behavior: 'smooth' })
    }

    setTimeout(() => {
      measureField()
      if (currentStep.focusSelector) {
        const focusEl = el.querySelector(currentStep.focusSelector) as HTMLElement | null
        if (focusEl) focusEl.focus({ preventScroll: true })
      }
    }, 400)
  }, [currentStep, measureField])

  useEffect(() => {
    measureViewport()
    measureField()

    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    const onResize = () => {
      measureViewport()
      setTimeout(measureField, 100)
    }
    const onScroll = () => {
      measureField()
      lastInteractionRef.current = Date.now()
      setShowNudge(false)
    }

    vv?.addEventListener('resize', onResize)
    vv?.addEventListener('scroll', onScroll)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    return () => {
      vv?.removeEventListener('resize', onResize)
      vv?.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [measureViewport, measureField])

  useEffect(() => {
    const firstUnfilled = steps.findIndex(s => !s.filled)
    setActiveIndex(firstUnfilled === -1 ? steps.length : firstUnfilled)
    setDismissed(false)
  }, [steps])

  useEffect(() => {
    if (needsScroll && currentStep && !dismissed && !submitReady) {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
      scrollTimerRef.current = setTimeout(() => scrollToField(), 300)
    }
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    }
  }, [needsScroll, currentStep, dismissed, submitReady, scrollToField])

  useEffect(() => {
    const onActivity = () => {
      lastInteractionRef.current = Date.now()
      setShowNudge(false)
    }
    window.addEventListener('touchstart', onActivity, { passive: true })
    window.addEventListener('click', onActivity)
    window.addEventListener('keydown', onActivity)

    const interval = setInterval(() => {
      if (submitReady || dismissed) return
      const idle = Date.now() - lastInteractionRef.current
      if (idle > INACTIVITY_MS && currentStep && !currentStep.filled) {
        setShowNudge(true)
      }
    }, 500)

    return () => {
      window.removeEventListener('touchstart', onActivity)
      window.removeEventListener('click', onActivity)
      window.removeEventListener('keydown', onActivity)
      clearInterval(interval)
    }
  }, [submitReady, dismissed, currentStep])

  useEffect(() => {
    if (!currentStep || submitReady || dismissed) return
    const t = setTimeout(measureField, 200)
    return () => clearTimeout(t)
  }, [activeIndex, currentStep, submitReady, dismissed, measureField])

  if (submitReady || dismissed) return null
  if (!currentStep) return null

  const totalSteps = steps.length
  const stepNum = activeIndex + 1
  const barTop = viewportTop + viewportHeight - BAR_HEIGHT
  const showHighlight = fieldRect && !needsScroll
  const arrowX = fieldRect ? fieldRect.left + fieldRect.width / 2 : 0
  const arrowTargetY = fieldRect ? fieldRect.bottom + 8 : 0
  const arrowDistance = barTop - arrowTargetY
  const arrowVisible = showHighlight && arrowDistance > 30

  return (
    <>
      {/* Spotlight overlay */}
      {showHighlight && (
        <div
          className="fixed inset-0 z-30 pointer-events-none transition-opacity duration-300"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${fieldRect!.bottom + 6}px,${Math.max(0, fieldRect!.left - 8)}px ${fieldRect!.bottom + 6}px,${Math.max(0, fieldRect!.left - 8)}px ${Math.max(0, fieldRect!.top - 8)}px,${Math.min(window.innerWidth, fieldRect!.right + 8)}px ${Math.max(0, fieldRect!.top - 8)}px,${Math.min(window.innerWidth, fieldRect!.right + 8)}px ${fieldRect!.bottom + 6}px,0 ${fieldRect!.bottom + 6}px)`,
          }}
        />
      )}

      {/* Highlight border around current field */}
      {showHighlight && (
        <div
          className="fixed z-31 pointer-events-none rounded-xl border-[3px] border-primary transition-all duration-300 ease-out"
          style={{
            left: fieldRect!.left - 6,
            top: fieldRect!.top - 6,
            width: fieldRect!.width + 12,
            height: fieldRect!.height + 12,
            boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.2)',
          }}
        />
      )}

      {/* Arrow from field down to bottom bar */}
      {arrowVisible && (
        <div
          className="fixed z-32 pointer-events-none transition-all duration-300 ease-out"
          style={{ left: arrowX - 16, top: arrowTargetY, height: arrowDistance }}
        >
          <div className="flex flex-col items-center justify-start h-full">
            <div className="bg-primary text-white px-3 py-1.5 rounded-lg shadow-lg text-sm font-bold whitespace-nowrap animate-nudge-down">
              <span className="flex items-center gap-1.5">
                <Hand className="h-4 w-4" />
                {showNudge ? 'Tap here!' : 'Here'}
              </span>
            </div>
            <div className="flex-1 flex items-center justify-center mt-1">
              <ChevronDown className="h-8 w-8 text-primary animate-bounce" />
            </div>
          </div>
        </div>
      )}

      {/* Bottom guidance bar - sits above keyboard */}
      <div
        className="fixed left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t-2 border-primary shadow-[0_-4px_20px_rgba(0,0,0,0.15)] transition-all duration-200"
        style={{ top: barTop, height: BAR_HEIGHT }}
      >
        <div className="flex items-center justify-between px-4 h-full max-w-2xl mx-auto">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">
              {stepNum}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {currentStep.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Step {stepNum} of {totalSteps}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              scrollToField()
              setShowNudge(false)
              lastInteractionRef.current = Date.now()
            }}
            className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              needsScroll
                ? 'bg-primary text-white animate-pulse-subtle'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            {needsScroll ? (
              <><ChevronDown className="h-4 w-4" />Scroll down</>
            ) : showNudge ? (
              <><Hand className="h-4 w-4" />Tap here</>
            ) : (
              <><Check className="h-4 w-4 text-green-600" />Got it</>
            )}
          </button>

          <button
            onClick={() => setDismissed(true)}
            className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-medium"
          >
            Skip
          </button>
        </div>
      </div>
    </>
  )
}
