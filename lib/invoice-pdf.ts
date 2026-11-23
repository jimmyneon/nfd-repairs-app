import { PDFDocument, rgb, PDFFont } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'fs/promises'
import path from 'path'
import {
  DEFAULT_BILLING,
  Invoice,
  invoiceTotal,
  money,
  paymentText,
} from './invoices'

/** Measured A4 layout. Table headers repeat and long lines split across pages. */
export async function invoicePdf(invoice: Invoice) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const [regBytes, boldBytes, logoBytes] = await Promise.all([
    readFile(path.join(process.cwd(), 'assets/fonts/DejaVuSans.ttf')),
    readFile(path.join(process.cwd(), 'assets/fonts/DejaVuSans-Bold.ttf')),
    readFile(path.join(process.cwd(), 'public/nfdr-logo.png')),
  ])
  const regular = await pdf.embedFont(regBytes, { subset: true }),
    bold = await pdf.embedFont(boldBytes, { subset: true })
  const logo = await pdf.embedPng(logoBytes)
  const p = invoice.payload,
    seller = p.seller || DEFAULT_BILLING
  const green = rgb(0.03, 0.42, 0.27),
    ink = rgb(0.09, 0.17, 0.14),
    muted = rgb(0.32, 0.4, 0.36),
    rule = rgb(0.85, 0.9, 0.87)
  const charset = new Set(regular.getCharacterSet())
  const clean = (s: string) =>
    Array.from(String(s).normalize('NFC'))
      .map((c) =>
        c === '\n' || c === '\r' || charset.has(c.codePointAt(0)!)
          ? c
          : c === '\t'
            ? ' '
            : '?',
      )
      .join('')
  let page = pdf.addPage([595.28, 841.89]),
    y = 0
  function draw(
    s: string,
    x: number,
    top: number,
    size = 10,
    font = regular,
    color = ink,
  ) {
    page.drawText(clean(s), { x, y: top, size, font, color })
  }
  function right(
    s: string,
    edge: number,
    top: number,
    size = 10,
    font = regular,
  ) {
    draw(s, edge - font.widthOfTextAtSize(clean(s), size), top, size, font)
  }
  function wrap(s: string, width: number, size = 10, font: PDFFont = regular) {
    const result: string[] = []
    for (const paragraph of clean(s).split(/\r?\n/)) {
      let line = ''
      for (const c of paragraph) {
        if (font.widthOfTextAtSize(line + c, size) > width) {
          const space = line.lastIndexOf(' ')
          if (space > 0) {
            result.push(line.slice(0, space))
            line = line.slice(space + 1)
          } else {
            result.push(line)
            line = ''
          }
        }
        line += c
      }
      result.push(line)
    }
    return result
  }
  function header(first = false) {
    page.drawRectangle({ x: 0, y: 834, width: 595.28, height: 8, color: green })
    if (first) {
      page.drawImage(logo, { x: 44, y: 730, width: 215, height: 86 })
      right(
        invoice.status === 'draft'
          ? 'DRAFT INVOICE'
          : invoice.status === 'void'
            ? 'VOID INVOICE'
            : 'INVOICE',
        551,
        779,
        24,
        bold,
      )
      right(invoice.number || 'Not issued', 551, 754, 12, bold)
      right(
        `Issued: ${new Date(p.issue_date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        551,
        732,
      )
      right(
        `Due: ${new Date(p.due_date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        551,
        716,
      )
      y = 694
    } else {
      draw(seller.business_name, 44, 790, 14, bold, green)
      right(invoice.number || 'Draft', 551, 790, 10, bold)
      y = 760
    }
  }
  function next() {
    page = pdf.addPage([595.28, 841.89])
    header()
  }
  function ensure(height: number) {
    if (y - height < 68) next()
  }
  function text(s: string, strong = false, size = 10, width = 507) {
    for (const line of wrap(s, width, size, strong ? bold : regular)) {
      ensure(size * 1.5)
      draw(line, 44, y, size, strong ? bold : regular)
      y -= size * 1.5
    }
  }
  header(true)
  // Issuer and customer sit side by side, leaving room for bank details on A4.
  type HeaderLine = { value: string; size: number; strong: boolean }
  const column = (
    value: string,
    width: number,
    size: number,
    strong = false,
  ): HeaderLine[] =>
    wrap(value, width, size, strong ? bold : regular).map((value) => ({
      value,
      size,
      strong,
    }))
  const left = [
    ...column(seller.legal_name, 240, 9),
    ...column(seller.address, 240, 9),
    ...column(seller.email, 240, 9),
    ...column(seller.website, 240, 9),
  ]
  const billTo = [
    ...column('BILL TO', 221, 9, true),
    ...column(p.customer_name, 221, 12, true),
    ...(p.customer_address ? column(p.customer_address, 221, 10) : []),
    ...(p.customer_email ? column(p.customer_email, 221, 10) : []),
  ]
  for (let n = 0; n < Math.max(left.length, billTo.length); n++) {
    const a = left[n],
      b = billTo[n]
    const height = Math.max(a?.size || 0, b?.size || 0) * 1.5
    ensure(height)
    if (a) draw(a.value, 44, y, a.size, a.strong ? bold : regular)
    if (b) draw(b.value, 330, y, b.size, b.strong ? bold : regular)
    y -= height
  }
  y -= 22
  text(p.title, true, 16)
  if (p.reference) text(`Reference: ${p.reference}`, false, 10)
  y -= 16
  function tableHeader() {
    ensure(48)
    page.drawRectangle({
      x: 44,
      y: y - 11,
      width: 507,
      height: 29,
      color: rgb(0.93, 0.96, 0.94),
    })
    draw('Description', 52, y, 9, bold)
    right('Qty', 365, y, 9, bold)
    right('Price', 449, y, 9, bold)
    right('Amount', 543, y, 9, bold)
    y -= 32
  }
  tableHeader()
  for (const item of p.items) {
    const desc = wrap(item.description, 275, 10)
    const rowHeight = desc.length * 15 + 23
    if (y < 105 || (rowHeight < 620 && y - rowHeight < 68)) {
      next()
      tableHeader()
    }
    right(String(item.quantity), 365, y)
    right(money(item.unit_pence), 449, y)
    right(money(Math.round(item.quantity * item.unit_pence)), 543, y, 10, bold)
    for (const line of desc) {
      if (y < 85) {
        next()
        tableHeader()
      }
      draw(line, 52, y)
      y -= 15
    }
    y -= 10
    page.drawLine({
      start: { x: 44, y: y + 3 },
      end: { x: 551, y: y + 3 },
      color: rule,
      thickness: 0.5,
    })
    y -= 13
  }
  ensure(135)
  y -= 6
  const total = invoiceTotal(p),
    paid = invoice.paid_pence,
    balance = Math.max(0, total - paid)
  draw('Total', 330, y, 11)
  right(money(total), 543, y, 11, bold)
  y -= 24
  draw('Payments received', 330, y, 10)
  right(money(paid), 543, y)
  y -= 32
  draw(balance ? 'Balance due' : 'Paid in full', 330, y, 14, bold, green)
  right(money(balance), 543, y, 16, bold)
  y -= 24
  if (paid > total) {
    draw('Overpayment', 330, y)
    right(money(paid - total), 543, y)
    y -= 22
  }
  text('No VAT charged.', false, 9)
  y -= 22
  ensure(65)
  text(
    invoice.status === 'void' ? 'Voided invoice' : 'Payment instructions',
    true,
    12,
  )
  y -= 5
  text(
    invoice.status === 'void'
      ? 'This invoice has been voided. No payment is requested.'
      : paymentText(p, invoice.number || undefined),
  )
  if (p.notes) {
    y -= 22
    ensure(50)
    text('Notes', true, 12)
    y -= 5
    text(p.notes)
  }
  y -= 8
  text(seller.footer, false, 9)
  pdf.getPages().forEach((pg, i, all) => {
    pg.drawLine({
      start: { x: 44, y: 48 },
      end: { x: 551, y: 48 },
      color: rule,
      thickness: 0.7,
    })
    pg.drawText(
      clean(`${invoice.number || 'Draft'} | ${seller.business_name}`),
      { x: 44, y: 32, size: 8, font: regular, color: muted },
    )
    const count = `Page ${i + 1} of ${all.length}`
    pg.drawText(count, {
      x: 551 - regular.widthOfTextAtSize(count, 8),
      y: 32,
      size: 8,
      font: regular,
      color: muted,
    })
  })
  pdf.setTitle(`${invoice.number || 'Draft'} - ${p.title}`)
  pdf.setAuthor(seller.business_name)
  return pdf.save()
}
