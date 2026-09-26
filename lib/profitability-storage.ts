import {
  DEFAULT_PROFITABILITY_SETTINGS,
  ProfitabilityEntry,
  ProfitabilitySettings,
  toMoneyNumber,
} from '@/lib/profitability'

const SETTINGS_KEY = 'profitability_settings'
const DAY_PREFIX = 'profitability_day_'

export type ProfitabilityStorageMode = 'supabase_table' | 'admin_settings_fallback'

function parseJson(value: unknown): any {
  if (value && typeof value === 'object') return value
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return null
}

export function isMissingProfitabilityTableError(error: any): boolean {
  if (!error) return false
  const code = String(error?.code || '')
  const text = [
    error?.message,
    error?.details,
    error?.hint,
  ].filter(Boolean).join(' ').toLowerCase()

  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    text.includes('daily_profitability') && (
      text.includes('does not exist') ||
      text.includes('schema cache') ||
      text.includes('could not find')
    ) ||
    text.includes('profitability_settings') && (
      text.includes('does not exist') ||
      text.includes('schema cache') ||
      text.includes('could not find')
    )
  )
}

function normaliseSettings(row: any): ProfitabilitySettings {
  return {
    rent_monthly: toMoneyNumber(row?.rent_monthly ?? DEFAULT_PROFITABILITY_SETTINGS.rent_monthly),
    internet_monthly: toMoneyNumber(row?.internet_monthly ?? DEFAULT_PROFITABILITY_SETTINGS.internet_monthly),
    water_monthly: toMoneyNumber(row?.water_monthly ?? DEFAULT_PROFITABILITY_SETTINGS.water_monthly),
    electricity_monthly: toMoneyNumber(row?.electricity_monthly ?? DEFAULT_PROFITABILITY_SETTINGS.electricity_monthly),
  }
}

function normaliseEntry(row: any): ProfitabilityEntry {
  return {
    id: String(row.id || row.entry_date),
    entry_date: String(row.entry_date),
    revenue: toMoneyNumber(row.revenue),
    parts_cost: toMoneyNumber(row.parts_cost),
    petty_cash_cost: toMoneyNumber(row.petty_cash_cost),
    job_count: Number(row.job_count || 0),
    daily_overhead: toMoneyNumber(row.daily_overhead),
    created_at: row.created_at || undefined,
    updated_at: row.updated_at || undefined,
  }
}

async function loadFallback(supabase: any, from: string, today: string) {
  const [{ data: rows, error: entriesError }, { data: settingRow, error: settingsError }] = await Promise.all([
    supabase
      .from('admin_settings')
      .select('key,value,updated_at')
      .like('key', `${DAY_PREFIX}%`)
      .order('key', { ascending: false }),
    supabase
      .from('admin_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle(),
  ])

  if (entriesError) throw entriesError
  if (settingsError) throw settingsError

  const parsedSettings = parseJson(settingRow?.value)
  const settings = parsedSettings
    ? normaliseSettings(parsedSettings)
    : DEFAULT_PROFITABILITY_SETTINGS

  const entries = (rows || [])
    .map((row: any) => {
      const parsed = parseJson(row.value)
      const entryDate = String(parsed?.entry_date || row.key.replace(DAY_PREFIX, ''))
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) return null
      return normaliseEntry({
        id: row.key,
        entry_date: entryDate,
        revenue: parsed?.revenue,
        parts_cost: parsed?.parts_cost,
        petty_cash_cost: parsed?.petty_cash_cost,
        job_count: parsed?.job_count,
        daily_overhead: parsed?.daily_overhead,
        updated_at: row.updated_at,
      })
    })
    .filter(Boolean)
    .filter((entry: any) => entry.entry_date >= from && entry.entry_date <= today)
    .sort((a: any, b: any) => b.entry_date.localeCompare(a.entry_date))

  return {
    entries: entries as ProfitabilityEntry[],
    settings,
    storage: 'admin_settings_fallback' as ProfitabilityStorageMode,
  }
}

export async function loadProfitabilityStorage(supabase: any, from: string, today: string) {
  const [entriesResult, settingsResult] = await Promise.all([
    supabase
      .from('daily_profitability')
      .select('entry_date,revenue,parts_cost,petty_cash_cost,job_count,daily_overhead,created_at,updated_at')
      .gte('entry_date', from)
      .lte('entry_date', today)
      .order('entry_date', { ascending: false }),
    supabase
      .from('profitability_settings')
      .select('id,rent_monthly,internet_monthly,water_monthly,electricity_monthly')
      .eq('id', 1)
      .maybeSingle(),
  ])

  const missingTables =
    isMissingProfitabilityTableError(entriesResult.error) ||
    isMissingProfitabilityTableError(settingsResult.error)

  if (missingTables) {
    return loadFallback(supabase, from, today)
  }

  if (entriesResult.error) throw entriesResult.error
  if (settingsResult.error) throw settingsResult.error

  return {
    entries: (entriesResult.data || []).map(normaliseEntry),
    settings: settingsResult.data
      ? normaliseSettings(settingsResult.data)
      : DEFAULT_PROFITABILITY_SETTINGS,
    storage: 'supabase_table' as ProfitabilityStorageMode,
  }
}

export async function saveProfitabilitySettings(
  supabase: any,
  settings: ProfitabilitySettings
): Promise<ProfitabilityStorageMode> {
  const payload = {
    id: 1,
    rent_monthly: settings.rent_monthly,
    internet_monthly: settings.internet_monthly,
    water_monthly: settings.water_monthly,
    electricity_monthly: settings.electricity_monthly,
  }

  const { error } = await supabase
    .from('profitability_settings')
    .upsert(payload, { onConflict: 'id' })

  if (!error) return 'supabase_table'
  if (!isMissingProfitabilityTableError(error)) throw error

  const { error: fallbackError } = await supabase.from('admin_settings').upsert({
    key: SETTINGS_KEY,
    value: settings,
    description: 'Recurring monthly costs used by the profitability tracker',
  }, { onConflict: 'key' })

  if (fallbackError) throw fallbackError
  return 'admin_settings_fallback'
}

export async function saveProfitabilityEntry(
  supabase: any,
  entry: Omit<ProfitabilityEntry, 'id' | 'created_at' | 'updated_at'>
): Promise<ProfitabilityStorageMode> {
  const { error } = await supabase
    .from('daily_profitability')
    .upsert(entry, { onConflict: 'entry_date' })

  if (!error) return 'supabase_table'
  if (!isMissingProfitabilityTableError(error)) throw error

  const { error: fallbackError } = await supabase.from('admin_settings').upsert({
    key: `${DAY_PREFIX}${entry.entry_date}`,
    value: entry,
    description: `Profitability entry for ${entry.entry_date}`,
  }, { onConflict: 'key' })

  if (fallbackError) throw fallbackError
  return 'admin_settings_fallback'
}

export async function profitabilityEntryExists(supabase: any, entryDate: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_profitability')
    .select('entry_date')
    .eq('entry_date', entryDate)
    .maybeSingle()

  if (!error) return Boolean(data)
  if (!isMissingProfitabilityTableError(error)) throw error

  const { data: fallback, error: fallbackError } = await supabase
    .from('admin_settings')
    .select('key')
    .eq('key', `${DAY_PREFIX}${entryDate}`)
    .maybeSingle()

  if (fallbackError) throw fallbackError
  return Boolean(fallback)
}
