'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ChevronDown, ChevronRight, Check } from 'lucide-react'

interface FieldStatus {
  id: string
  filled: boolean
}

interface FormGuideOverlayProps {
  fields: FieldStatus[]
  submitReady: boolean
}

export default function FormGuideOverlay({ fields, submitReady }: FormGuideOverlayProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const [scrollHint, setScrollHint] = useState(false)
  const rafRef = useRef<number>(0)

  const currentField = fields[activeIndex]

  const updatePosition = useCallback(() => {
    if (submitReady) {
      setTargetRect(null)
      setScrollHint(false)
      return
    }

    if (!currentField) {
      setTargetRect(null)
      setScrollHint(false)
      return
    }

    const el = document.getElementById(currentField.id)
    if (!el) {
      setTargetRect(null)
      setScrollHint(false)
      return
    }

    const rect = el.getBoundingClientRect()
    const viewportHeight = window.innerHeight

    if (rect.bottom < 80 || rect.top > viewportHeight - 120) {
      setScrollHint(true)
      setTargetRect(null)
    } else {
      setScrollHint(false)
      setTargetRect(rect)
    }
  }, [currentField, submitReady])

  useEffect(() => {
    const tick = () => {
      updatePosition()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [updatePosition])

  useEffect(() => {
    const firstUnfilled = fields.findIndex(f => !f.filled)
    setActiveIndex(firstUnfilled === -1 ? fields.length : firstUnfilled)
  }, [fields])

  if (submitReady) return null

  if (scrollHint && currentField) {
    return (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <div className="flex flex-col items-center gap-1 bg-primary text-white px-4 py-2 rounded-full shadow-lg animate-bounce-subtle">
          <span className="text-xs font-bold">Scroll to continue</span>
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </div>
      </div>
    )
  }

  if (!targetRect || !currentField) return null

  const arrowLeft = targetRect.right + 12
  const arrowTop = targetRect.top + targetRect.height / 2 - 12
  const showRightArrow = arrowLeft < window.innerWidth - 40

  return (
    <>
      {showRightArrow ? (
        <div
          className="fixed z-40 pointer-events-none transition-all duration-300 ease-out"
          style={{ left: arrowLeft, top: arrowTop }}
        >
          <div className="flex items-center gap-1 bg-primary text-white px-2 py-1 rounded-lg shadow-lg animate-nudge-right">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      ) : (
        <div
          className="fixed z-40 pointer-events-none transition-all duration-300 ease-out"
          style={{ left: targetRect.left + targetRect.width / 2 - 12, top: targetRect.bottom + 8 }}
        >
          <div className="flex flex-col items-center">
            <div className="w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-primary" />
            <div className="bg-primary text-white px-3 py-1 rounded-lg shadow-lg animate-nudge-down">
              <span className="text-xs font-bold">Tap here</span>
            </div>
          </div>
        </div>
      )}
      <div
        className="fixed z-30 pointer-events-none rounded-xl border-2 border-primary/40 animate-pulse-subtle transition-all duration-300 ease-out"
        style={{
          left: targetRect.left - 4,
          top: targetRect.top - 4,
          width: targetRect.width + 8,
          height: targetRect.height + 8,
        }}
      />
    </>
  )
}
