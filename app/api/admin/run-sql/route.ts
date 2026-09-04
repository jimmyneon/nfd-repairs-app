import { NextResponse } from 'next/server'
import pg from 'pg'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SQL_FIX = `
CREATE OR REPLACE FUNCTION generate_job_ref()
RETURNS TRIGGER AS $$
DECLARE
    today_date TEXT;
    max_num INTEGER;
    new_ref TEXT;
BEGIN
    today_date := TO_CHAR(NOW(), 'YYYYMMDD');
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(job_ref FROM 'NFD-[0-9]{8}-([0-9]+)') AS INTEGER)
    ), 0) INTO max_num
    FROM jobs
    WHERE job_ref LIKE 'NFD-' || today_date || '-%';
    new_ref := 'NFD-' || today_date || '-' || LPAD((max_num + 1)::TEXT, 3, '0');
    NEW.job_ref := new_ref;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`

export async function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405 })
}

export async function POST(request: Request) {
  // Simple auth check
  const body = await request.json().catch(() => ({}))
  const authKey = body.auth_key || ''
  if (authKey !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { Client } = pg
  const REF = 'pmwwaorjzxwuagjvtkkn'
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

  // Try multiple connection methods
  const connectionConfigs = [
    // Method 1: DATABASE_URL env var (if set on Vercel)
    ...(process.env.DATABASE_URL ? [{
      name: 'DATABASE_URL',
      config: { connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 }
    }] : []),
    // Method 2: POSTGRES_URL env var
    ...(process.env.POSTGRES_URL ? [{
      name: 'POSTGRES_URL',
      config: { connectionString: process.env.POSTGRES_URL, connectionTimeoutMillis: 8000 }
    }] : []),
    // Method 3: Direct connection with POSTGRES_PASSWORD env var
    ...(process.env.POSTGRES_PASSWORD ? [{
      name: 'POSTGRES_PASSWORD (direct)',
      config: {
        host: `db.${REF}.supabase.co`,
        port: 5432,
        user: 'postgres',
        password: process.env.POSTGRES_PASSWORD,
        database: 'postgres',
        connectionTimeoutMillis: 8000,
      }
    }] : []),
    // Method 4: Pooler with service role key as JWT (Supavisor)
    {
      name: 'Supavisor pooler (eu-west-1)',
      config: {
        host: 'aws-0-eu-west-1.pooler.supabase.com',
        port: 6543,
        user: `postgres.${REF}`,
        password: SB_KEY,
        database: 'postgres',
        connectionTimeoutMillis: 8000,
      }
    },
    // Method 5: Direct with service role key (will likely fail but try anyway)
    {
      name: 'Direct with service role key',
      config: {
        host: `db.${REF}.supabase.co`,
        port: 5432,
        user: 'postgres',
        password: SB_KEY,
        database: 'postgres',
        connectionTimeoutMillis: 8000,
      }
    },
  ]

  const attempts: string[] = []

  for (const { name, config } of connectionConfigs) {
    try {
      attempts.push(`Trying: ${name}...`)
      const client = new Client(config)
      await client.connect()
      attempts.push(`Connected via ${name}! Executing SQL fix...`)

      await client.query(SQL_FIX)
      attempts.push('SQL executed successfully.')

      // Verify the fix
      const verify = await client.query(`
        SELECT pg_get_functiondef('generate_job_ref()'::regprocedure) as def
      `)
      const usesMax = verify.rows[0]?.def?.includes('MAX') || false
      attempts.push(`Verification: function uses MAX = ${usesMax}`)

      await client.end()
      return NextResponse.json({
        success: true,
        method: name,
        usesMax,
        log: attempts,
      })
    } catch (e: any) {
      attempts.push(`Failed: ${e.message.substring(0, 200)}`)
    }
  }

  return NextResponse.json({
    success: false,
    error: 'All connection methods failed',
    log: attempts,
    envVarsAvailable: Object.keys(process.env).filter(k =>
      k.includes('DATABASE') || k.includes('POSTGRES') || k.includes('PG') || k.includes('DB_')
    ),
  }, { status: 500 })
}
