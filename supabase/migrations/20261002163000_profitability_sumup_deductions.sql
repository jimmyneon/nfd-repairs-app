-- Track SumUp card takings separately so merchant fees affect operating profit
-- while cash-advance repayments are shown as a separate cashflow deduction.
-- Safe for databases that briefly used the earlier setup_fees/additional_cost_percent names.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_profitability' AND column_name = 'setup_fees'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'daily_profitability' AND column_name = 'sumup_takings'
  ) THEN
    ALTER TABLE public.daily_profitability RENAME COLUMN setup_fees TO sumup_takings;
  END IF;
END $$;

ALTER TABLE public.daily_profitability
  ADD COLUMN IF NOT EXISTS sumup_takings NUMERIC(10,2) NOT NULL DEFAULT 0
  CHECK (sumup_takings >= 0);

ALTER TABLE public.daily_profitability
  ADD COLUMN IF NOT EXISTS sumup_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.99
  CHECK (sumup_fee_percent >= 0 AND sumup_fee_percent <= 100);

ALTER TABLE public.daily_profitability
  ADD COLUMN IF NOT EXISTS cash_advance_percent NUMERIC(5,2) NOT NULL DEFAULT 15
  CHECK (cash_advance_percent >= 0 AND cash_advance_percent <= 100);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profitability_settings' AND column_name = 'additional_cost_percent'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profitability_settings' AND column_name = 'cash_advance_percent'
  ) THEN
    ALTER TABLE public.profitability_settings RENAME COLUMN additional_cost_percent TO cash_advance_percent;
  END IF;
END $$;

ALTER TABLE public.profitability_settings
  ADD COLUMN IF NOT EXISTS sumup_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 0.99
  CHECK (sumup_fee_percent >= 0 AND sumup_fee_percent <= 100);

ALTER TABLE public.profitability_settings
  ADD COLUMN IF NOT EXISTS cash_advance_percent NUMERIC(5,2) NOT NULL DEFAULT 15
  CHECK (cash_advance_percent >= 0 AND cash_advance_percent <= 100);

UPDATE public.profitability_settings
SET sumup_fee_percent = COALESCE(sumup_fee_percent, 0.99),
    cash_advance_percent = COALESCE(cash_advance_percent, 15)
WHERE id = 1;
