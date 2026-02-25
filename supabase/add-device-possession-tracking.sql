-- Add device possession tracking to jobs table
-- This enables explicit tracking of whether device is physically in shop
-- Independent of job status, drives messaging logic

-- 1. Add device_in_shop column
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS device_in_shop BOOLEAN DEFAULT FALSE;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_jobs_device_in_shop ON jobs(device_in_shop);

-- 3. Add comment for documentation
COMMENT ON COLUMN jobs.device_in_shop IS 
'Explicit tracking of whether device is physically in shop. 
Drives messaging logic independently of status.
TRUE = device in shop, FALSE = customer has device';

-- 4. Backfill existing jobs based on current status
-- This infers possession from status for historical data
UPDATE jobs 
SET device_in_shop = CASE 
  -- Device definitely in shop for these statuses
  WHEN status IN ('DROPPED_OFF', 'RECEIVED', 'IN_REPAIR', 'READY_TO_COLLECT') THEN TRUE
  
  -- Device with customer for these statuses
  WHEN status IN ('QUOTE_APPROVED') THEN FALSE
  
  -- Parts flow - device typically NOT in shop until dropped off
  WHEN status IN ('AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED') THEN FALSE
  
  -- Completed/collected - device no longer in shop
  WHEN status IN ('COLLECTED', 'COMPLETED', 'CANCELLED') THEN FALSE
  
  -- Default to false for safety (assume customer has device)
  ELSE FALSE
END
WHERE device_in_shop IS NULL;

-- 5. Verify backfill results
SELECT 
  status,
  device_in_shop,
  COUNT(*) as job_count
FROM jobs
GROUP BY status, device_in_shop
ORDER BY status, device_in_shop;

-- 6. Show summary
SELECT 
  'Total jobs' as metric,
  COUNT(*) as count
FROM jobs
UNION ALL
SELECT 
  'Device in shop' as metric,
  COUNT(*) as count
FROM jobs
WHERE device_in_shop = TRUE
UNION ALL
SELECT 
  'Device with customer' as metric,
  COUNT(*) as count
FROM jobs
WHERE device_in_shop = FALSE;
