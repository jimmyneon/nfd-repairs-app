-- Action-Oriented Job System Enhancements
-- Adds tracking link expiration, time-in-status tracking, and parts tracking
-- Run this in Supabase SQL Editor

-- Add new fields for action-oriented workflow
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tracking_link_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parts_ordered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS parts_expected_at TIMESTAMPTZ;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status_changed_at ON jobs(status_changed_at);
CREATE INDEX IF NOT EXISTS idx_jobs_tracking_expires ON jobs(tracking_link_expires_at) WHERE tracking_link_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_parts_ordered ON jobs(parts_ordered_at) WHERE parts_ordered_at IS NOT NULL;

-- Trigger to update status_changed_at when status changes
CREATE OR REPLACE FUNCTION update_status_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        NEW.status_changed_at := NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_status_timestamp ON jobs;
CREATE TRIGGER jobs_status_timestamp
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_status_timestamp();

-- Trigger to set tracking link expiration when job is closed
CREATE OR REPLACE FUNCTION set_tracking_expiration()
RETURNS TRIGGER AS $$
BEGIN
    -- Set expiration to 30 days after closure
    IF OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
        NEW.tracking_link_expires_at := NEW.closed_at + INTERVAL '30 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_tracking_expiration ON jobs;
CREATE TRIGGER jobs_tracking_expiration
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION set_tracking_expiration();

-- Trigger to track when parts are ordered
CREATE OR REPLACE FUNCTION track_parts_ordered()
RETURNS TRIGGER AS $$
BEGIN
    -- Set parts_ordered_at when status changes to PARTS_ORDERED
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'PARTS_ORDERED' THEN
        NEW.parts_ordered_at := NOW();
        -- Set expected arrival to 3 days from now (default estimate)
        IF NEW.parts_expected_at IS NULL THEN
            NEW.parts_expected_at := NOW() + INTERVAL '3 days';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_parts_tracking ON jobs;
CREATE TRIGGER jobs_parts_tracking
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION track_parts_ordered();

-- Backfill status_changed_at for existing jobs (use updated_at as fallback)
UPDATE jobs
SET status_changed_at = updated_at
WHERE status_changed_at IS NULL;

-- Backfill parts_ordered_at for jobs currently in PARTS_ORDERED status
UPDATE jobs
SET parts_ordered_at = updated_at,
    parts_expected_at = updated_at + INTERVAL '3 days'
WHERE status = 'PARTS_ORDERED' 
  AND parts_ordered_at IS NULL;

-- Set expiration for already closed jobs
UPDATE jobs
SET tracking_link_expires_at = closed_at + INTERVAL '30 days'
WHERE closed_at IS NOT NULL 
  AND tracking_link_expires_at IS NULL;

-- Add helpful comments
COMMENT ON COLUMN jobs.status_changed_at IS 'Timestamp when status last changed - used to calculate time in current status';
COMMENT ON COLUMN jobs.tracking_link_expires_at IS 'When the tracking link expires (30 days after job closure)';
COMMENT ON COLUMN jobs.parts_ordered_at IS 'Timestamp when parts were ordered';
COMMENT ON COLUMN jobs.parts_expected_at IS 'Expected arrival date for ordered parts';

-- Create view for action-based job grouping
CREATE OR REPLACE VIEW jobs_action_view AS
SELECT 
    j.*,
    -- Calculate time in current status (in hours)
    EXTRACT(EPOCH FROM (NOW() - j.status_changed_at)) / 3600 AS hours_in_status,
    
    -- Calculate days in current status
    EXTRACT(EPOCH FROM (NOW() - j.status_changed_at)) / 86400 AS days_in_status,
    
    -- Determine action group
    CASE
        -- URGENT: Delayed >24hrs, high priority ready to work, or deposit overdue >48hrs
        WHEN j.status = 'DELAYED' AND EXTRACT(EPOCH FROM (NOW() - j.status_changed_at)) > 86400 THEN 'URGENT'
        WHEN j.status IN ('IN_REPAIR', 'PARTS_ARRIVED', 'RECEIVED') 
             AND j.priority_score >= 80 
             AND j.device_in_shop = true THEN 'URGENT'
        WHEN j.status = 'AWAITING_DEPOSIT' 
             AND EXTRACT(EPOCH FROM (NOW() - j.status_changed_at)) > 172800 THEN 'URGENT'
        
        -- READY_TO_WORK: Can be worked on right now
        WHEN j.status = 'IN_REPAIR' AND j.device_in_shop = true THEN 'READY_TO_WORK'
        WHEN j.status = 'PARTS_ARRIVED' AND j.device_in_shop = true THEN 'READY_TO_WORK'
        WHEN j.status = 'RECEIVED' AND j.parts_required = false AND j.device_in_shop = true THEN 'READY_TO_WORK'
        
        -- WAITING: Blocked by something
        WHEN j.status = 'AWAITING_DEPOSIT' THEN 'WAITING'
        WHEN j.status = 'PARTS_ORDERED' THEN 'WAITING'
        WHEN j.status = 'QUOTE_APPROVED' THEN 'WAITING'
        WHEN j.status = 'RECEIVED' AND j.parts_required = true THEN 'WAITING'
        
        -- READY_TO_COLLECT: Waiting for customer
        WHEN j.status = 'READY_TO_COLLECT' THEN 'READY_TO_COLLECT'
        
        -- COLLECTED: Waiting for auto-close
        WHEN j.status = 'COLLECTED' THEN 'COLLECTED'
        
        -- Default
        ELSE 'OTHER'
    END AS action_group,
    
    -- Determine blocker type
    CASE
        WHEN j.status = 'AWAITING_DEPOSIT' THEN 'DEPOSIT'
        WHEN j.status = 'PARTS_ORDERED' THEN 'PARTS_ORDERED'
        WHEN j.status = 'QUOTE_APPROVED' THEN 'AWAITING_DROPOFF'
        WHEN j.status = 'DELAYED' THEN 'DELAYED'
        WHEN j.status = 'RECEIVED' AND j.parts_required = true THEN 'NEEDS_DEPOSIT'
        ELSE NULL
    END AS blocker_type,
    
    -- Is this job overdue/stuck?
    CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - j.status_changed_at)) > 259200 THEN true -- >3 days
        ELSE false
    END AS is_overdue,
    
    -- Calculate deposit overdue days
    CASE
        WHEN j.status = 'AWAITING_DEPOSIT' THEN 
            GREATEST(0, EXTRACT(EPOCH FROM (NOW() - j.status_changed_at)) / 86400 - 2)
        ELSE 0
    END AS deposit_overdue_days

FROM jobs j
WHERE j.status NOT IN ('COMPLETED', 'CANCELLED');

COMMENT ON VIEW jobs_action_view IS 'Action-oriented view of jobs with calculated time metrics and groupings';
