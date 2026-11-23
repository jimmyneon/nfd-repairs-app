import {
  DEFAULT_BILLING,
  Invoice,
  invoiceTotal,
  money,
  paymentText,
} from './invoices'
export const escapeHtml = (s: unknown) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )
const lines = (s: string) => escapeHtml(s).replace(/\n/g, '<br>')
/** Table layout works in email clients and in the browser preview. */
export function invoiceHtml(invoice: Invoice, downloadUrl?: string) {
  const p = invoice.payload,
    s = p.seller || DEFAULT_BILLING,
    e = escapeHtml
  const total = invoiceTotal(p),
    paid = invoice.paid_pence,
    balance = Math.max(0, total - paid)
  const date = (v: string) =>
    new Date(`${v}T12:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  const rows = p.items
    .map(
      (i) =>
        `<tr><td style="padding:16px 12px;border-bottom:1px solid #e2e8e5;word-break:break-word">${lines(i.description)}</td><td align="right" style="padding:16px 8px;vertical-align:top">${e(i.quantity)}</td><td align="right" style="padding:16px 8px;vertical-align:top;white-space:nowrap">${money(i.unit_pence)}</td><td align="right" style="padding:16px 12px;vertical-align:top;white-space:nowrap">${money(Math.round(i.quantity * i.unit_pence))}</td></tr>`,
    )
    .join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(invoice.number || 'Draft invoice')}</title></head><body style="margin:0;background:#f2f5f3;font-family:Arial,sans-serif;color:#172c24;font-size:16px;line-height:1.5"><table width="100%" role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 10px"><table role="presentation" width="680" style="width:100%;max-width:680px;background:#fff;border-top:6px solid #087247" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 28px">
  <img src="${e(s.website.replace(/\/$/, ''))}/images/logo.png" alt="${e(s.business_name)}" width="240" style="display:block;max-width:75%;height:auto;margin-bottom:20px">
  <table role="presentation" width="100%"><tr><td style="vertical-align:top"><strong>${e(s.business_name)}</strong><br>${lines(s.address)}<br>${e(s.email)}<br>${e(s.website)}</td><td align="right" style="vertical-align:top"><span style="font-size:28px;font-weight:bold;color:#087247">${invoice.status === 'draft' ? 'DRAFT' : invoice.status === 'void' ? 'VOID' : 'INVOICE'}</span><br><strong>${e(invoice.number || 'Not issued')}</strong><br>Issued ${date(p.issue_date)}<br>Due ${date(p.due_date)}</td></tr></table>
  <div style="padding:20px 0;border-top:1px solid #e2e8e5;margin-top:24px"><span style="font-size:12px;color:#52665e;letter-spacing:1px">BILL TO</span><br><strong>${e(p.customer_name)}</strong><br>${p.customer_address ? lines(p.customer_address) + '<br>' : ''}${e(p.customer_email)}</div>
  <h1 style="font-size:20px;margin:8px 0">${e(p.title)}</h1>${p.reference ? `<p style="color:#52665e;margin:0 0 16px">Reference: ${e(p.reference)}</p>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;border-collapse:collapse;table-layout:fixed"><thead style="background:#edf5f0;color:#24533e"><tr><th align="left" style="width:47%;padding:12px">Description</th><th align="right" style="width:10%;padding:12px 8px">Qty</th><th align="right" style="width:20%;padding:12px 8px">Price</th><th align="right" style="width:23%;padding:12px">Amount</th></tr></thead><tbody>${rows}</tbody></table>
  <table width="100%" role="presentation" style="margin:20px 0"><tr><td>Total</td><td align="right">${money(total)}</td></tr><tr><td>Payments received</td><td align="right">${money(paid)}</td></tr><tr style="font-size:22px;font-weight:bold;color:#087247"><td style="padding-top:12px">${balance ? 'Balance due' : 'Paid in full'}</td><td align="right" style="padding-top:12px">${money(balance)}</td></tr>${paid > total ? `<tr><td>Overpayment</td><td align="right">${money(paid - total)}</td></tr>` : ''}</table>
  <p style="font-size:13px;color:#52665e">No VAT charged.</p>
  ${invoice.status === 'void' ? '<p>This invoice has been voided. No payment is requested against this invoice.</p>' : `<div style="background:#f2f6f3;padding:18px;border-radius:8px"><strong>Payment instructions</strong><p style="margin:8px 0 0">${lines(paymentText(p, invoice.number || undefined))}</p></div>`}
  ${p.notes ? `<p style="margin-top:24px">${lines(p.notes)}</p>` : ''}
  ${downloadUrl ? `<p style="margin:28px 0"><a href="${e(downloadUrl)}" style="display:inline-block;background:#087247;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">Download PDF invoice</a></p>` : ''}
  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8e5;font-size:12px;color:#52665e">${e(s.legal_name)}<br>${lines(s.footer)}</div>
  </td></tr></table></td></tr></table></body></html>`
}
