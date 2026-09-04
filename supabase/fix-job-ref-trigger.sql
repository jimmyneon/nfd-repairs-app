-- Fix the generate_job_ref() trigger to use MAX instead of COUNT.
-- The original COUNT-based approach breaks when jobs are deleted,
-- causing duplicate key violations that block ALL new job creation.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR:
-- Dashboard → SQL Editor → New query → paste → Run
--
-- Safe to run repeatedly (CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION generate_job_ref()
RETURNS TRIGGER AS $$
DECLARE
    today_date TEXT;
    max_num INTEGER;
    new_ref TEXT;
BEGIN
    today_date := TO_CHAR(NOW(), 'YYYYMMDD');

    -- Use MAX to find the highest existing ref number for today,
    -- instead of COUNT which breaks when jobs are deleted.
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
