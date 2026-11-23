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
export type InvoiceEmailTheme = 'auto' | 'light' | 'dark'
/** Image-free, two-column email with explicit light/dark palettes. */
export function invoiceHtml(
  invoice: Invoice,
  downloadUrl?: string,
  options: { theme?: InvoiceEmailTheme } = {},
) {
  const p = invoice.payload,
    s = p.seller || DEFAULT_BILLING,
    e = escapeHtml,
    total = invoiceTotal(p),
    paid = invoice.paid_pence
  const balance = invoice.status === 'void' ? 0 : Math.max(0, total - paid)
  const state =
    invoice.status === 'draft'
      ? 'Draft invoice'
      : invoice.status === 'void'
        ? 'Voided invoice'
        : 'Invoice'
  const amountLabel =
    invoice.status === 'void'
      ? 'No payment due'
      : balance
        ? 'Balance due'
        : 'Paid in full'
  const date = (v: string) =>
    new Date(v + 'T12:00:00Z').toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Europe/London',
    })
  const dark = `.mail-bg{background-color:#111b17!important;color:#e9f0ec!important}.mail-card{background-color:#1b2922!important;border-color:#3c5146!important}.mail-text{color:#e9f0ec!important}.mail-muted{color:#bdcec3!important}.mail-rule{border-color:#3c5146!important}.mail-panel{background-color:#24382d!important;color:#e9f0ec!important}.mail-accent,.mail-link{color:#8cddb1!important}.mail-button{background-color:#087247!important;color:#ffffff!important}`
  const theme = options.theme || 'auto'
  const css =
    theme === 'dark'
      ? dark
      : theme === 'auto'
        ? `@media(prefers-color-scheme:dark){${dark}}\n${dark.replace(
            /([^{}]+)\{/g,
            (_, selectors) =>
              selectors
                .split(',')
                .map((selector: string) => '[data-ogsc] ' + selector.trim())
                .join(',') + '{',
          )}`
        : ''
  const rows = p.items
    .map(
      (i) =>
        `<tr><td class="mail-rule mail-text" style="padding:18px 0;border-bottom:1px solid #dce5df;vertical-align:top;overflow-wrap:anywhere;color:#172c24">${lines(i.description)}<br><span class="mail-muted" style="color:#52665e;font-size:14px">${e(i.quantity)} × ${money(i.unit_pence)}</span></td><td class="mail-rule mail-text" align="right" style="text-align:right;width:110px;padding:18px 0 18px 14px;border-bottom:1px solid #dce5df;vertical-align:top;white-space:nowrap;color:#172c24;font-weight:bold">${money(Math.round(i.quantity * i.unit_pence))}</td></tr>`,
    )
    .join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${e(invoice.number || state)}</title><style>:root{color-scheme:light dark}body{margin:0}table{border-collapse:collapse}a{color:#087247}@media(max-width:520px){.mail-outer{padding:12px 8px!important}.mail-padding{padding:24px 18px!important}.mail-stack{display:block!important;width:100%!important;text-align:left!important}.mail-meta{padding:14px 0 0!important}.mail-amount{font-size:32px!important}}${css}</style></head>
 <body class="mail-bg" style="margin:0;background-color:#f1f5f2;color:#172c24;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55"><table role="presentation" width="100%" style="width:100%"><tr><td class="mail-outer" align="center" style="padding:28px 12px"><table role="presentation" width="640" class="mail-card" style="width:100%;max-width:640px;background-color:#ffffff;border:1px solid #dce5df;border-top:4px solid #087247"><tr><td class="mail-padding" style="padding:32px">
 <p class="mail-text" style="margin:0 0 24px;font-size:20px;font-weight:bold;color:#172c24">${e(s.business_name)}</p>
 <table role="presentation" width="100%" style="width:100%"><tr><td class="mail-stack" style="vertical-align:top"><p class="mail-muted" style="margin:0;color:#52665e;font-size:14px">${e(state)}${invoice.number ? ' · ' + e(invoice.number) : ''}</p><p class="mail-accent mail-amount" style="margin:5px 0 0;font-size:36px;font-weight:bold;line-height:1.2;color:#087247">${money(balance)}</p><p class="mail-muted" style="margin:5px 0 0;color:#52665e;font-size:14px">${e(amountLabel)}</p></td><td class="mail-stack mail-meta mail-muted" align="right" style="text-align:right;vertical-align:top;padding-left:16px;color:#52665e;font-size:14px"><span class="mail-text" style="color:#172c24">Invoice date</span> ${date(p.issue_date)}<br><span class="mail-text" style="color:#172c24">Due date</span> ${date(p.due_date)}${p.reference ? '<br>Reference ' + e(p.reference) : ''}</td></tr></table>
 <div class="mail-rule" style="margin-top:26px;padding-top:24px;border-top:1px solid #dce5df"><h1 class="mail-text" style="margin:0 0 18px;font-size:21px;line-height:1.4;color:#172c24">${e(p.title)}</h1><p class="mail-muted" style="margin:0 0 3px;color:#52665e;font-size:14px">Bill to</p><p class="mail-text" style="margin:0;color:#172c24"><strong>${e(p.customer_name)}</strong>${p.customer_address ? '<br>' + lines(p.customer_address) : ''}${p.customer_email ? '<br>' + e(p.customer_email) : ''}</p></div>
 <table width="100%" style="width:100%;margin-top:24px;table-layout:fixed"><thead><tr><th class="mail-rule mail-muted" align="left" scope="col" style="border-bottom:1px solid #dce5df;padding:0 0 10px;color:#52665e;font-size:14px;font-weight:normal">Description</th><th class="mail-rule mail-muted" align="right" scope="col" style="width:110px;border-bottom:1px solid #dce5df;padding:0 0 10px;color:#52665e;font-size:14px;font-weight:normal">Amount</th></tr></thead><tbody>${rows}</tbody></table>
 <table role="presentation" width="100%" class="mail-text" style="width:100%;margin:16px 0;color:#172c24"><tr><td style="padding:4px 0">Total</td><td align="right" style="text-align:right;padding:4px 0">${money(total)}</td></tr>${paid ? `<tr><td style="padding:4px 0">Payments received</td><td align="right" style="text-align:right;padding:4px 0">${money(paid)}</td></tr>` : ''}<tr><td style="padding:10px 0 4px;font-weight:bold">${e(amountLabel)}</td><td align="right" style="text-align:right;padding:10px 0 4px;font-weight:bold">${money(balance)}</td></tr>${paid > total ? `<tr><td>Overpayment</td><td align="right">${money(paid - total)}</td></tr>` : ''}</table><p class="mail-muted" style="margin:0 0 24px;color:#52665e;font-size:14px">No VAT charged.</p>
 ${invoice.status === 'void' ? '<p class="mail-text">This invoice has been voided. No payment is requested against this invoice.</p>' : `<div class="mail-panel" style="background-color:#edf5f0;color:#172c24;padding:18px;border-radius:8px"><p style="margin:0 0 8px;font-weight:bold">Payment instructions</p><p style="margin:0;overflow-wrap:anywhere">${lines(paymentText(p, invoice.number || undefined))}</p></div>`}
 ${p.notes ? `<p class="mail-text" style="margin:22px 0 0;color:#172c24">${lines(p.notes)}</p>` : ''}
 ${downloadUrl ? `<p style="margin:26px 0 0"><a class="mail-button" href="${e(downloadUrl)}" style="display:inline-block;padding:12px 20px;background-color:#087247;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:bold">Download PDF invoice</a></p>` : ''}
 <div class="mail-rule mail-muted" style="margin-top:28px;padding-top:20px;border-top:1px solid #dce5df;color:#52665e;font-size:14px">${lines(s.footer)}<br><br>${e(s.legal_name)}<br>${lines(s.address)}<br>${e(s.email)}${s.website ? ` · <a class="mail-link" style="color:#087247" href="${e(s.website)}">${e(s.website.replace(/^https?:\/\//, ''))}</a>` : ''}</div>
 </td></tr></table></td></tr></table></body></html>`
}
