import type { SupabaseClient } from '@supabase/supabase-js'
import { jobInvoice, invoiceUrl } from './invoice-service'
import { COMPLETED_INVOICE_STATUSES, invoiceTotal, money } from './invoices'
import { escapeHtml } from './invoice-template'
import { invoicePdf } from './invoice-pdf'
/** Add the same invoice to an existing repair email without sending a second email. */
export async function repairInvoiceEmail(
  db: SupabaseClient,
  job: { id: string; status: string },
  template: { html: string; text: string },
) {
  if (!COMPLETED_INVOICE_STATUSES.includes(job.status))
    return {
      template,
      attachments: [] as { filename: string; content: Buffer }[],
    }
  const invoice = await jobInvoice(db, job.id)
  if (!invoice || invoice.status !== 'issued')
    return {
      template,
      attachments: [] as { filename: string; content: Buffer }[],
    }
  const total = invoiceTotal(invoice.payload),
    balance = Math.max(0, total - invoice.paid_pence),
    url = invoiceUrl(invoice)
  const text = `Invoice ${invoice.number}: ${money(total)}. Payments received: ${money(invoice.paid_pence)}. Balance: ${money(balance)}. Download: ${url}`
  const block = `<table role="presentation" width="100%" style="max-width:600px;margin:24px auto;background:#edf5f0;border-radius:8px;font-family:Arial,sans-serif"><tr><td style="padding:24px;color:#172c24"><strong>Invoice ${escapeHtml(invoice.number)}</strong><p>Total: ${money(total)}<br>Payments received: ${money(invoice.paid_pence)}<br><strong>${balance ? 'Balance due' : 'Paid in full'}: ${money(balance)}</strong></p><a href="${escapeHtml(url)}" style="color:#087247;font-weight:bold">Download your PDF invoice</a><p style="font-size:14px">A copy is attached to this email.</p></td></tr></table>`
  return {
    template: {
      ...template,
      html: template.html.includes('</body>')
        ? template.html.replace('</body>', block + '</body>')
        : template.html + block,
      text: template.text + '\n\n' + text,
    },
    attachments: [
      {
        filename: `${invoice.number}.pdf`,
        content: Buffer.from(await invoicePdf(invoice)),
      },
    ],
  }
}
