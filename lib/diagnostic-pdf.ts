import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'fs/promises'
import path from 'path'
import { DiagnosticReport, reportSections } from './diagnostic-reports'
import { SHOP_INFO } from './constants'

/** A4 text layout with measured wrapping, long-word splitting and page footers. */
export async function diagnosticPdf(report: DiagnosticReport) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(path.join(process.cwd(), 'assets/fonts/DejaVuSans.ttf')),
    readFile(path.join(process.cwd(), 'assets/fonts/DejaVuSans-Bold.ttf')),
  ])
  const regular = await pdf.embedFont(regularBytes, { subset: true })
  const bold = await pdf.embedFont(boldBytes, { subset: true })
  const green = rgb(0.03, 0.42, 0.27)
  // Embed fonts for consistent mobile/desktop printing and engineering symbols.
  const supported = new Set(regular.getCharacterSet())
  const clean = (text: string) => Array.from(text.normalize('NFC')).map(c =>
    c === '\t' ? '    ' : supported.has(c.codePointAt(0)!) ? c : '?'
  ).join('')
  let page = pdf.addPage([595.28, 841.89])
  let y = 0
  function header() {
    page.drawText(SHOP_INFO.name, { x: 48, y: 790, size: 16, font: bold, color: green })
    page.drawText('5A New Street, Lymington, Hampshire', { x: 48, y: 771, size: 9, font: regular })
    page.drawText(`${SHOP_INFO.phone} | ${SHOP_INFO.email}`, { x: 48, y: 756, size: 9, font: regular })
    y = 726
  }
  function nextPage() { page = pdf.addPage([595.28, 841.89]); header() }
  function text(value: string, strong = false, size = 11) {
    const font = strong ? bold : regular
    for (const paragraph of value.split(/\r?\n/)) {
      let line = ''
      const draw = () => {
        if (y < 65) nextPage()
        page.drawText(line, { x: 48, y, font, size, color: rgb(0.1, 0.15, 0.13) })
        y -= size * 1.5
        line = ''
      }
      for (const char of clean(paragraph)) {
        if (font.widthOfTextAtSize(line + char, size) > 499) {
          const space = line.lastIndexOf(' ')
          if (space > 0) {
            const rest = line.slice(space + 1)
            line = line.slice(0, space)
            draw()
            line = rest
          } else draw()
        }
        line += char
      }
      draw()
    }
  }
  header()
  text(report.title, true, 18)
  y -= 8
  text(`Repair reference: ${report.job_ref || 'See repair tracking'}`)
  text(`Customer: ${report.customer_name || 'Not recorded'}`)
  text(`Device: ${report.device || 'See repair tracking'}`)
  text(`Report date: ${report.published_at ? new Date(report.published_at).toLocaleDateString('en-GB', { timeZone: 'Europe/London' }) : 'Not recorded'}`)
  for (const [label, value] of reportSections(report)) {
    y -= 16
    if (y < 100) nextPage()
    text(label, true, 12)
    text(value)
  }
  const pages = pdf.getPages()
  pages.forEach((p, index) => {
    p.drawLine({ start: { x: 48, y: 47 }, end: { x: 547, y: 47 }, color: green, thickness: 0.6 })
    p.drawText(`${clean(report.job_ref || 'Diagnostic report')} | Page ${index + 1} of ${pages.length}`, { x: 48, y: 32, size: 9, font: regular })
  })
  pdf.setTitle(report.title)
  pdf.setAuthor(SHOP_INFO.name)
  return pdf.save()
}
