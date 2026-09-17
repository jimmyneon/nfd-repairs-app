'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Activity } from 'lucide-react'

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <>
      {children}
      {pathname === '/app/analytics' && (
        <Link
          href="/app/analytics/quote-ux"
          className="fixed right-4 bottom-20 z-40 flex items-center gap-2 rounded-full bg-gray-900 dark:bg-white px-4 py-3 text-sm font-semibold text-white dark:text-gray-900 shadow-lg"
          aria-label="Open quote UX diagnostics"
        >
          <Activity className="w-4 h-4" />
          UX diagnostics
        </Link>
      )}
    </>
  )
}
