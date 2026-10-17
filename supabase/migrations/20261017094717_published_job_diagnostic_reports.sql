-- Existing jobs.diagnostic_report remains a private working copy. No historical
-- notes are auto-published: staff must explicitly review and publish them.
CREATE TABLE public.job_diagnostic_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  title text NOT NULL,
  report_text text NOT NULL,
  conclusion text NOT NULL DEFAULT '',
  recommendations text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT '',
  job_ref text,
  device text,
  customer_name text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  published_at timestamptz
);
CREATE UNIQUE INDEX job_diagnostic_reports_one_draft
  ON public.job_diagnostic_reports(job_id) WHERE published_at IS NULL;
CREATE INDEX job_diagnostic_reports_published
  ON public.job_diagnostic_reports(job_id, published_at DESC) WHERE published_at IS NOT NULL;
ALTER TABLE public.job_diagnostic_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.job_diagnostic_reports FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_diagnostic_reports TO service_role;
-- Staff use the guarded server API. No customer can query these rows directly.

CREATE FUNCTION public.save_job_diagnostic_report(p_job_id uuid, p_report jsonb, p_publish boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE j public.jobs;
BEGIN
  SELECT * INTO STRICT j FROM public.jobs WHERE id = p_job_id FOR UPDATE;
  IF length(trim(coalesce(p_report->>'title', ''))) = 0
    OR length(trim(coalesce(p_report->>'report_text', ''))) = 0 THEN
    RAISE EXCEPTION 'Title and findings required';
  END IF;
  DELETE FROM public.job_diagnostic_reports WHERE job_id = p_job_id AND published_at IS NULL;
  INSERT INTO public.job_diagnostic_reports
    (job_id,title,report_text,conclusion,recommendations,outcome,job_ref,device,customer_name,published_at)
  VALUES (j.id,p_report->>'title',p_report->>'report_text',coalesce(p_report->>'conclusion',''),
    coalesce(p_report->>'recommendations',''),coalesce(p_report->>'outcome',''),j.job_ref,
    concat_ws(' ',j.device_make,j.device_model),j.customer_name,
    CASE WHEN p_publish THEN clock_timestamp() ELSE NULL END);
  UPDATE public.jobs SET diagnostic_report = p_report->>'report_text' WHERE id = j.id;
  INSERT INTO public.job_events(job_id,type,message) VALUES(j.id,'SYSTEM',
    CASE WHEN p_publish THEN 'Diagnostic report published to customer tracking' ELSE 'Diagnostic report draft saved (private)' END);
END;
$$;
REVOKE ALL ON FUNCTION public.save_job_diagnostic_report(uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_job_diagnostic_report(uuid,jsonb,boolean) TO service_role;
