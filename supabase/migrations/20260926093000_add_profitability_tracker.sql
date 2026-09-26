-- Daily profitability tracker and editable recurring overheads.
-- Values are seeded from the current shop costs discussed in September 2026.

CREATE TABLE IF NOT EXISTS profitability_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_monthly NUMERIC(10,2) NOT NULL DEFAULT 1300 CHECK (rent_monthly >= 0),
  internet_monthly NUMERIC(10,2) NOT NULL DEFAULT 40 CHECK (internet_monthly >= 0),
  water_monthly NUMERIC(10,2) NOT NULL DEFAULT 40 CHECK (water_monthly >= 0),
  electricity_monthly NUMERIC(10,2) NOT NULL DEFAULT 150 CHECK (electricity_monthly >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO profitability_settings (rent_monthly, internet_monthly, water_monthly, electricity_monthly)
SELECT 1300, 40, 40, 150
WHERE NOT EXISTS (SELECT 1 FROM profitability_settings);

CREATE TABLE IF NOT EXISTS daily_profitability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL UNIQUE,
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

DROP TRIGGER IF EXISTS update_profitability_settings_updated_at ON profitability_settings;
CREATE TRIGGER update_profitability_settings_updated_at
  BEFORE UPDATE ON profitability_settings
  FOR EACH ROW EXECUTE FUNCTION update_profitability_updated_at();

DROP TRIGGER IF EXISTS update_daily_profitability_updated_at ON daily_profitability;
CREATE TRIGGER update_daily_profitability_updated_at
  BEFORE UPDATE ON daily_profitability
  FOR EACH ROW EXECUTE FUNCTION update_profitability_updated_at();

-- The app reads/writes these through authenticated server routes using the
-- service role. Keep direct browser access closed by default.
ALTER TABLE profitability_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_profitability ENABLE ROW LEVEL SECURITY;
