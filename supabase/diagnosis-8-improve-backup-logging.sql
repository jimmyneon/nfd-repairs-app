-- DIAGNOSIS 8: Improve backup function to return actual count
-- This will help us see if the function is finding and scheduling jobs

-- Drop existing function first (required to change return type)
DROP FUNCTION IF EXISTS backup_schedule_post_collection_sms();

CREATE OR REPLACE FUNCTION backup_schedule_post_collection_sms()
RETURNS TABLE(scheduled_count INTEGER, job_refs TEXT[])
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scheduled_count INTEGER;
  v_job_refs TEXT[];
BEGIN
  -- Get list of jobs that will be scheduled
  SELECT ARRAY_AGG(job_ref)
  INTO v_job_refs
  FROM public.jobs
  WHERE status = 'COLLECTED'
    AND post_collection_sms_scheduled_at IS NULL
    AND skip_review_request = false
    AND (customer_flag IS NULL OR customer_flag NOT IN ('sensitive', 'awkward'));
  
  -- Schedule all COLLECTED jobs that haven't been scheduled
  UPDATE public.jobs
  SET 
    post_collection_sms_scheduled_at = NOW() + INTERVAL '3 hours',
    post_collection_email_scheduled_at = NOW() + INTERVAL '3 hours'
  WHERE status = 'COLLECTED'
    AND post_collection_sms_scheduled_at IS NULL
    AND skip_review_request = false
    AND (customer_flag IS NULL OR customer_flag NOT IN ('sensitive', 'awkward'));
  
  GET DIAGNOSTICS v_scheduled_count = ROW_COUNT;
  
  RAISE NOTICE 'Backup scheduled % post-collection SMS jobs: %', v_scheduled_count, v_job_refs;
  
  RETURN QUERY SELECT v_scheduled_count, COALESCE(v_job_refs, ARRAY[]::TEXT[]);
END;
$$;

-- Test the improved function
SELECT * FROM backup_schedule_post_collection_sms();
