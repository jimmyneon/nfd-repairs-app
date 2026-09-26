-- Proper storage for the daily profitability tracker.
-- Safe to run more than once.
-- Existing profitability JSON rows in admin_settings are copied into the
-- dedicated tables so entries made before this migration are preserved.

CREATE TABLE IF NOT EXISTS profitability_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rent_monthly NUMERIC(10,2) NOT NULL DEFAULT 1300 CHECK (rent_monthly >= 0),
  internet_monthly NUMERIC(10,2) NOT NULL DEFAULT 40 CHECK (internet_monthly >= 0),
  water_monthly NUMERIC(10,2) NOT NULL DEFAULT 40 CHECK (water_monthly >= 0),
  electricity_monthly NUMERIC(10,2) NOT NULL DEFAULT 150 CHECK (electricity_monthly >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_profitability (
  entry_date DATE PRIMARY KEY,
  revenue NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  parts_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (parts_cost >= 0),
  petty_cash_cost NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (petty_cash_cost >= 0),
  job_count INTEGER NOT NULL DEFAULT 0 CHECK (job_count >= 0),
  daily_overhead NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (daily_overhead >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_profitability_entry_date
  ON daily_profitability(entry_date DESC);

CREATE OR REPLACE FUNCTION update_profitability_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profitability_settings_updated_at ON profitability_settings;
CREATE TRIGGER profitability_settings_updated_at
  BEFORE UPDATE ON profitability_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_profitability_updated_at();

DROP TRIGGER IF EXISTS daily_profitability_updated_at ON daily_profitability;
CREATE TRIGGER daily_profitability_updated_at
  BEFORE UPDATE ON daily_profitability
  FOR EACH ROW
  EXECUTE FUNCTION update_profitability_updated_at();

-- Seed defaults.
INSERT INTO profitability_settings (
  id, rent_monthly, internet_monthly, water_monthly, electricity_monthly
)
VALUES (1, 1300, 40, 40, 150)
ON CONFLICT (id) DO NOTHING;

-- Copy the current recurring costs from the temporary admin_settings storage.
INSERT INTO profitability_settings (
  id, rent_monthly, internet_monthly, water_monthly, electricity_monthly
)
SELECT
  1,
  COALESCE((value->>'rent_monthly')::NUMERIC, 1300),
  COALESCE((value->>'internet_monthly')::NUMERIC, 40),
  COALESCE((value->>'water_monthly')::NUMERIC, 40),
  COALESCE((value->>'electricity_monthly')::NUMERIC, 150)
FROM admin_settings
WHERE key = 'profitability_settings'
ON CONFLICT (id) DO UPDATE SET
  rent_monthly = EXCLUDED.rent_monthly,
  internet_monthly = EXCLUDED.internet_monthly,
  water_monthly = EXCLUDED.water_monthly,
  electricity_monthly = EXCLUDED.electricity_monthly;

-- Copy every day already entered through the temporary JSON fallback.
INSERT INTO daily_profitability (
  entry_date,
  revenue,
  parts_cost,
  petty_cash_cost,
  job_count,
  daily_overhead
)
SELECT
  COALESCE(
    NULLIF(value->>'entry_date', '')::DATE,
    REPLACE(key, 'profitability_day_', '')::DATE
  ),
  COALESCE((value->>'revenue')::NUMERIC, 0),
  COALESCE((value->>'parts_cost')::NUMERIC, 0),
  COALESCE((value->>'petty_cash_cost')::NUMERIC, 0),
  COALESCE((value->>'job_count')::INTEGER, 0),
  COALESCE((value->>'daily_overhead')::NUMERIC, 0)
FROM admin_settings
WHERE key LIKE 'profitability_day_%'
ON CONFLICT (entry_date) DO UPDATE SET
  revenue = EXCLUDED.revenue,
  parts_cost = EXCLUDED.parts_cost,
  petty_cash_cost = EXCLUDED.petty_cash_cost,
  job_count = EXCLUDED.job_count,
  daily_overhead = EXCLUDED.daily_overhead;

-- These tables are accessed by authenticated server routes using the
-- service-role client. Direct browser access stays closed.
ALTER TABLE profitability_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_profitability ENABLE ROW LEVEL SECURITY;
