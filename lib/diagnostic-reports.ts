export interface DiagnosticReport {
  id?: string
  title: string
  report_text: string
  conclusion: string
  recommendations: string
  outcome: string
  published_at?: string | null
  job_ref?: string
  device?: string
  customer_name?: string
}

export const REPORT_FIELDS = 'id,title,report_text,conclusion,recommendations,outcome,published_at,job_ref,device,customer_name'

export function reportSchemaUnavailable(error: { code?: string } | null) {
  return !!error && ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(error.code || '')
}

export function validateReport(body: Record<string, unknown>): DiagnosticReport | null {
  const fields = ['title', 'report_text', 'conclusion', 'recommendations', 'outcome'] as const
  if (fields.some(key => typeof body[key] !== 'string' || (body[key] as string).length > (key === 'title' ? 200 : 50000))) return null
  const report = Object.fromEntries(fields.map(key => [key, (body[key] as string).trim()])) as unknown as DiagnosticReport
  return report.title && report.report_text ? report : null
}

export function reportSections(report: DiagnosticReport) {
  return [
    ['Diagnostic findings', report.report_text],
    ["Technician’s conclusion", report.conclusion],
    ['Recommendations', report.recommendations],
    ['Repair outcome', report.outcome],
  ].filter(([, text]) => text)
}
