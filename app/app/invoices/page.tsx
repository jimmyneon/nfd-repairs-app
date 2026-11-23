'use client'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import InvoiceWorkspace from '@/components/invoices/InvoiceWorkspace'
function Workspace() {
  const query = useSearchParams()
  return <InvoiceWorkspace jobId={query.get('jobId') || undefined} />
}
export default function InvoicesPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading invoices…</p>}>
      <Workspace />
    </Suspense>
  )
}
