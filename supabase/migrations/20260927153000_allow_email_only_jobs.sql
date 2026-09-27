-- Enquiries may legitimately provide email as their only contact method.
-- Keep at least one contact route while allowing customer_phone to be null.
ALTER TABLE public.jobs
  ALTER COLUMN customer_phone DROP NOT NULL;

ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_contact_method_required;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_contact_method_required CHECK (
    NULLIF(BTRIM(customer_phone), '') IS NOT NULL
    OR NULLIF(BTRIM(customer_email), '') IS NOT NULL
  );
