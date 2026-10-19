import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { diagnosticPdf } from '@/lib/diagnostic-pdf'
import { validateReport } from '@/lib/diagnostic-reports'

const state = vi.hoisted(() => ({ db: null as any, authenticated: true, allowed: true }))
vi.mock('@/lib/resilience', () => ({ createServiceClient: () => state.db }))
vi.mock('@/lib/api-auth', () => ({ requireStaffUser: async () => state.authenticated
  ? { user: { email: 'staff@example.com' }, response: null }
  : { response: new Response('{}', { status: 401 }) } }))
vi.mock('@/lib/rate-limit', () => ({ getClientIP: () => 'test', checkRateLimit: async () => ({ allowed: state.allowed }) }))
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => ({ value: 'legacy-token' }) }) }))
vi.mock('next/navigation', () => ({ redirect: () => { throw Error('Redirect to login') } }))
import { POST, GET as staffGet } from '@/app/api/jobs/diagnostic-reports/route'
import { GET } from '@/app/api/tracking/[token]/diagnostic-reports/route'
import { GET as legacyGet } from '@/app/api/repair/[id]/diagnostic-reports/route'
import LegacyPage from '@/app/repair/[id]/page'

const jobId = '10000000-0000-4000-8000-000000000001'
const otherId = '10000000-0000-4000-8000-000000000002'
const token = 'a'.repeat(64)
const otherToken = 'b'.repeat(64)
const report = { title: 'Steam Deck OLED Diagnostic Report', report_text: 'Battery initially measured 0 V. After recovery charging, current draw changed but USB-C still did not negotiate 15 V. Board inspected for shorts. Thermal inspection found no abnormal hot spots. EC supply voltages checked.', conclusion: 'Board-level fault remains unresolved. No confirmed failed component identified.', recommendations: 'Further specialist board diagnosis or manufacturer repair recommended.', outcome: 'Unrepairable within the scope of the work carried out.' }
let pg: PGlite

// Supabase transport adapter: route queries execute against real PostgreSQL WASM.
// Authentication is mocked; database queries, migration and save function are real.
function table(name: string) {
  const quote = (s: string) => { if (!/^[a-z_]+$/.test(s)) throw Error('Invalid identifier'); return `"${s}"` }
  let fields = '*', single = false, limit = '', order: string[] = [], clauses: string[] = [], args: unknown[] = [], updating = ''
  const q: any = {
    update(values: Record<string, unknown>) { updating = Object.entries(values).map(([key, value]) => { args.push(value); return `${quote(key)} = $${args.length}` }).join(','); return q },
    select(value: string) { fields = value.split(',').map(v => quote(v.trim())).join(','); return q },
    eq(key: string, value: unknown) { args.push(value); clauses.push(`${quote(key)} = $${args.length}`); return q },
    not(key: string, op: string, value: unknown) { if (op !== 'is' || value !== null) throw Error('Unsupported'); clauses.push(`${quote(key)} IS NOT NULL`); return q },
    order(key: string, opts: { ascending: boolean }) { order.push(`${quote(key)} ${opts.ascending ? 'ASC' : 'DESC'}`); return q },
    limit(n: number) { limit = ` LIMIT ${n}`; return q },
    maybeSingle() { single = true; return q },
    single() { single = true; return q },
    async then(resolve: any, reject: any) {
      try {
        const sql = `${updating ? `UPDATE ${quote(name)} SET ${updating}` : `SELECT ${fields} FROM ${quote(name)}`}${clauses.length ? ' WHERE ' + clauses.join(' AND ') : ''}${order.length ? ' ORDER BY ' + order.join(',') : ''}${limit}`
        const result = await pg.query(sql, args)
        return resolve({ data: single ? result.rows[0] || null : result.rows, error: null })
      } catch (error) { return resolve({ data: null, error }) }
    },
  }
  return q
}
const staffRequest = (action = 'draft', contents = report) => new NextRequest('https://test/api/jobs/diagnostic-reports', { method: 'POST', body: JSON.stringify({ ...contents, jobId, action }) })
const customer = (key = token, query = '') => GET(new NextRequest(`https://test/api/tracking/${key}/diagnostic-reports${query}`), { params: { token: key } })

beforeAll(async () => {
  pg = new PGlite()
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE jobs(id uuid PRIMARY KEY, job_ref text, device_make text, device_model text, customer_name text, diagnostic_report text, diagnosis_notes text, status text, tracking_token text, tracking_link_expires_at timestamptz);
    CREATE TABLE job_events(job_id uuid, type text, message text);
    CREATE TABLE staff_allowlist(email text);
    INSERT INTO staff_allowlist VALUES ('staff@example.com');
    CREATE TABLE magic_links(token text, repair_id uuid, expires_at timestamptz, used boolean);
    CREATE TABLE repairs(id uuid, customer_name text, device_type text, device_model text, notes text,
      created_at timestamptz,issue_description text,status text,estimated_completion timestamptz,actual_completion timestamptz,cost_estimate numeric,final_cost numeric,warranty_expiry timestamptz);
    CREATE TABLE repair_updates(id uuid,repair_id uuid,created_at timestamptz,status text,message text,is_customer_visible boolean);
    CREATE TABLE issues(id uuid,repair_id uuid,created_at timestamptz,issue_type text,description text,status text,resolution text,resolved_at timestamptz);
    CREATE TABLE repair_diagnostic_reports(id uuid, repair_id uuid, title text, report_text text, published_at timestamptz);`)
  await pg.exec(readFileSync('supabase/migrations/20261017094717_published_job_diagnostic_reports.sql', 'utf8'))
  state.db = { from: table, rpc: async (_: string, args: any) => {
    try { await pg.query('SELECT save_job_diagnostic_report($1,$2,$3)', [args.p_job_id, JSON.stringify(args.p_report), args.p_publish]); return { error: null } }
    catch (error) { return { error } }
  } }
}, 30000)
afterAll(async () => { await pg.close() })
beforeEach(async () => {
  state.authenticated = true; state.allowed = true
  await pg.exec('TRUNCATE jobs, job_diagnostic_reports, job_events, magic_links, repairs, repair_diagnostic_reports CASCADE')
  await pg.query(`INSERT INTO jobs VALUES ($1,'NFD-TEST','Valve','Steam Deck OLED','Test Customer','Existing private findings','INTERNAL PASSCODE DO NOT EXPOSE','DIAGNOSTIC',$2,now() - interval '6 months'),($3,'OTHER','Apple','iPhone','Other Customer',NULL,NULL,'COLLECTED',$4,NULL)`, [jobId, token, otherId, otherToken])
})

describe('diagnostic report publication workflow', () => {
  it('saves private drafts; publishing exposes the complete report immediately', async () => {
    expect((await POST(staffRequest())).status).toBe(200)
    expect((await (await customer()).json()).reports).toEqual([])
    expect((await (await staffGet(new NextRequest(`https://test/api?jobId=${jobId}`))).json()).draft.report_text).toBe(report.report_text)
    expect((await POST(staffRequest('publish'))).status).toBe(200)
    const visible = (await (await customer()).json()).reports[0]
    expect(visible).toMatchObject({ ...report, job_ref: 'NFD-TEST', device: 'Valve Steam Deck OLED', customer_name: 'Test Customer' })
    expect(visible.published_at).toBeTruthy()
    expect(JSON.stringify(visible)).not.toContain('INTERNAL PASSCODE')
    expect((await pg.query('SELECT diagnosis_notes FROM jobs WHERE id=$1', [jobId])).rows[0]).toMatchObject({ diagnosis_notes: 'INTERNAL PASSCODE DO NOT EXPOSE' })
  })
  it.each(['PARTS_ORDERED','IN_REPAIR','READY_TO_COLLECT','COMPLETED','COLLECTED','UNREPAIRABLE','CANCELLED','CLOSED','REOPENED','WARRANTY'])('keeps report readable/downloadable in %s with expired normal tracking', async status => {
    await POST(staffRequest('publish'))
    await pg.query('UPDATE jobs SET status=$1 WHERE id=$2', [status, jobId])
    expect((await (await customer()).json()).reports[0].report_text).toBe(report.report_text)
    const pdf = await customer(token, '?download=1')
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf')
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString()).toBe('%PDF-')
  })
  it('keeps last publication visible while editing; retains previous versions', async () => {
    await POST(staffRequest('publish'))
    const first = (await (await customer()).json()).reports[0]
    const edited = { ...report, report_text: 'Revised confirmed findings' }
    await POST(staffRequest('draft', edited))
    expect((await (await customer()).json()).reports[0].report_text).toBe(report.report_text)
    await POST(staffRequest('publish', edited))
    expect((await (await customer()).json()).reports[0].report_text).toBe(edited.report_text)
    expect((await pg.query('SELECT id FROM job_diagnostic_reports WHERE published_at IS NOT NULL')).rows).toHaveLength(2)
    expect((await customer(token, `?report=${first.id}&download=1`)).status).toBe(200)
  })
  it('denies another repair token access to a report, including PDF', async () => {
    await POST(staffRequest('publish'))
    const id = (await (await customer()).json()).reports[0].id
    expect((await (await customer(otherToken)).json()).reports).toEqual([])
    expect((await customer(otherToken, `?report=${id}&download=1`)).status).toBe(404)
    expect((await customer('c'.repeat(64))).status).toBe(404)
    expect((await customer('short')).status).toBe(400)
  })
  it('never auto-publishes historical private text, or drafts requested by ID', async () => {
    expect((await (await customer()).json()).reports).toEqual([])
    await POST(staffRequest())
    const draft: any = (await pg.query('SELECT id FROM job_diagnostic_reports')).rows[0]
    expect((await customer(token, `?report=${draft.id}&download=1`)).status).toBe(404)
  })
  it('rejects anonymous/non-staff writes and incomplete publications', async () => {
    state.authenticated = false
    expect((await POST(staffRequest('publish'))).status).toBe(401)
    state.authenticated = true
    await pg.exec("DELETE FROM staff_allowlist")
    expect((await POST(staffRequest('publish'))).status).toBe(403)
    await pg.exec("INSERT INTO staff_allowlist VALUES ('staff@example.com')")
    // Only title + findings are required to publish; the optional sections are
    // stored empty and hidden from the customer view.
    expect((await POST(staffRequest('publish', { ...report, conclusion: '', recommendations: '', outcome: '' }))).status).toBe(200)
    expect(validateReport({ ...report, title: 123 })).toBeNull()
  })
  it('denies direct customer reads/writes/RPC execution at the database', async () => {
    for (const role of ['anon', 'authenticated']) {
      await pg.exec(`SET ROLE ${role}`)
      await expect(pg.query('SELECT * FROM job_diagnostic_reports')).rejects.toThrow(/permission denied/)
      await expect(pg.query('SELECT save_job_diagnostic_report($1,$2,true)', [jobId, JSON.stringify(report)])).rejects.toThrow(/permission denied/)
      await pg.exec('RESET ROLE')
    }
  })
  it('returns a retryable error on a database failure', async () => {
    const original = state.db
    state.db = { from: () => { throw Error('offline') } }
    expect((await customer()).status).toBe(503)
    state.db = original
    state.allowed = false
    expect((await customer()).status).toBe(429)
  })
  it('keeps private findings saves working before the migration and never claims to publish', async () => {
    await pg.exec('ALTER TABLE job_diagnostic_reports RENAME TO temporarily_missing_reports')
    try {
      const loaded = await (await staffGet(new NextRequest(`https://test/api?jobId=${jobId}`))).json()
      expect(loaded).toMatchObject({ migrationReady: false, legacyDraft: 'Existing private findings' })
      expect((await (await POST(staffRequest())).json()).legacyDraft).toBe(true)
      expect((await POST(staffRequest('publish'))).status).toBe(503)
      expect((await (await customer()).json()).reports).toEqual([])
      expect((await pg.query('SELECT diagnostic_report FROM jobs WHERE id=$1', [jobId])).rows[0]).toMatchObject({ diagnostic_report: report.report_text })
    } finally { await pg.exec('ALTER TABLE temporarily_missing_reports RENAME TO job_diagnostic_reports') }
  })
  it('rolls back publication and working copy together when event persistence fails', async () => {
    await pg.exec("ALTER TABLE job_events ADD CONSTRAINT simulate_failure CHECK (message NOT LIKE '%published%')")
    try {
      expect((await POST(staffRequest('publish'))).status).toBe(503)
      expect((await (await customer()).json()).reports).toEqual([])
      expect((await pg.query('SELECT diagnostic_report FROM jobs WHERE id=$1', [jobId])).rows[0]).toMatchObject({ diagnostic_report: 'Existing private findings' })
    } finally { await pg.exec('ALTER TABLE job_events DROP CONSTRAINT simulate_failure') }
  })
})

describe('legacy reports', () => {
  const req = (id = jobId, query = '', cookie = 'legacy-token') => legacyGet(new NextRequest(`https://test/api/repair/${id}/diagnostic-reports${query}`, { headers: { cookie: `repair_token=${cookie}` } }), { params: { id } })
  it('preserves published legacy text, hides drafts, and provides real PDF', async () => {
    await pg.query("INSERT INTO magic_links VALUES ('legacy-token',$1,now()+interval '1 day',true)", [jobId])
    await pg.query("INSERT INTO repairs(id,customer_name,device_type,device_model,notes) VALUES ($1,'Test Customer','Console','Steam Deck OLED','INTERNAL SECRET')", [jobId])
    await pg.query("INSERT INTO repair_diagnostic_reports VALUES ($1,$2,'Legacy Report','Existing published text',now()),($3,$2,'Draft','Private notes',NULL)", [jobId, jobId, otherId])
    expect((await (await req()).json()).reports).toHaveLength(1)
    const pdf = await req(jobId, '?download=1')
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf')
    const page = await LegacyPage({ params: { id: jobId } })
    expect(page.props.repair).not.toHaveProperty('notes')
    expect(JSON.stringify(page.props)).not.toContain('INTERNAL SECRET')
    expect((await req(otherId, '?download=1')).status).toBe(401)
    await pg.exec("UPDATE magic_links SET expires_at=now()-interval '1 second'")
    expect((await req()).status).toBe(401)
  })
})

it('generates multi-page A4 PDF with long lines and UK text', async () => {
  const bytes = await diagnosticPdf({ ...report, report_text: (report.report_text + '\n').repeat(45) + 'X'.repeat(300), job_ref: 'NFD-TEST', device: 'Valve Steam Deck OLED', customer_name: 'Test Customer', published_at: '2026-10-17T10:00:00Z' })
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBeGreaterThan(2)
  for (const page of pdf.getPages()) { expect(page.getWidth()).toBeCloseTo(595.28); expect(page.getHeight()).toBeCloseTo(841.89) }
  if (process.env.REPORT_PDF_PREVIEW) { mkdirSync('tmp/pdfs', { recursive: true }); writeFileSync('tmp/pdfs/diagnostic-preview.pdf', bytes) }
})
