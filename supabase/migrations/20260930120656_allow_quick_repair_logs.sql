-- Keep a contact route compulsory for normal jobs. Staff quick logs are
-- explicitly identified so walk-in repairs can be counted without fake data.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_contact_method_required;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_contact_method_required CHECK (
  NULLIF(BTRIM(customer_phone), '') IS NOT NULL
  OR NULLIF(BTRIM(customer_email), '') IS NOT NULL
  OR COALESCE(source = 'staff_quick_log', false)
);
