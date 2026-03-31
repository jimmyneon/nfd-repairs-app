-- Job Enhancements: Auto-close, Priority, Customer Flags, Review Toggle
-- Run this in Supabase SQL Editor

-- Add new fields to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS priority_score INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS customer_flag TEXT CHECK (customer_flag IS NULL OR customer_flag IN ('sensitive', 'awkward', 'vip', 'normal')),
ADD COLUMN IF NOT EXISTS customer_flag_notes TEXT,
ADD COLUMN IF NOT EXISTS skip_review_request BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS repair_type TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_collected_at ON jobs(collected_at) WHERE collected_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_closed_at ON jobs(closed_at);
CREATE INDEX IF NOT EXISTS idx_jobs_priority_score ON jobs(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_customer_flag ON jobs(customer_flag) WHERE customer_flag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_repair_type ON jobs(repair_type);

-- Function to calculate priority score based on device type and repair type
CREATE OR REPLACE FUNCTION calculate_priority_score(
    p_device_make TEXT,
    p_device_model TEXT,
    p_issue TEXT,
    p_repair_type TEXT
) RETURNS INTEGER AS $$
DECLARE
    score INTEGER := 50; -- Base score
    device_lower TEXT;
    issue_lower TEXT;
    repair_lower TEXT;
BEGIN
    device_lower := LOWER(COALESCE(p_device_make, '') || ' ' || COALESCE(p_device_model, ''));
    issue_lower := LOWER(COALESCE(p_issue, ''));
    repair_lower := LOWER(COALESCE(p_repair_type, ''));
    
    -- HIGHEST PRIORITY: Mobile phone screens and batteries (90-100)
    IF (device_lower LIKE '%iphone%' OR device_lower LIKE '%samsung%' OR 
        device_lower LIKE '%google%' OR device_lower LIKE '%pixel%' OR
        device_lower LIKE '%huawei%' OR device_lower LIKE '%motorola%' OR
        device_lower LIKE '%nokia%' OR device_lower LIKE '%oneplus%' OR
        device_lower LIKE '%xiaomi%' OR device_lower LIKE '%oppo%') THEN
        
        IF (issue_lower LIKE '%screen%' OR issue_lower LIKE '%display%' OR 
            repair_lower LIKE '%screen%' OR repair_lower LIKE '%display%') THEN
            score := 100; -- Mobile screen = highest priority
        ELSIF (issue_lower LIKE '%battery%' OR repair_lower LIKE '%battery%') THEN
            score := 95; -- Mobile battery = very high priority
        ELSIF (issue_lower LIKE '%charging%' OR issue_lower LIKE '%charge port%' OR 
               issue_lower LIKE '%usb%' OR repair_lower LIKE '%charging%') THEN
            score := 90; -- Mobile charging port = high priority
        ELSE
            score := 70; -- Other mobile repairs
        END IF;
    END IF;
    
    -- HIGH PRIORITY: Tablet screens (iPad, etc.) (80-85)
    IF (device_lower LIKE '%ipad%' OR device_lower LIKE '%tablet%') THEN
        IF (issue_lower LIKE '%screen%' OR issue_lower LIKE '%display%' OR 
            repair_lower LIKE '%screen%' OR repair_lower LIKE '%display%') THEN
            score := 85; -- Tablet screen
        ELSIF (issue_lower LIKE '%battery%' OR repair_lower LIKE '%battery%') THEN
            score := 80; -- Tablet battery
        ELSE
            score := 65; -- Other tablet repairs
        END IF;
    END IF;
    
    -- MEDIUM-HIGH PRIORITY: Laptop screens (75-80)
    IF (device_lower LIKE '%macbook%' OR device_lower LIKE '%laptop%' OR 
        device_lower LIKE '%notebook%') THEN
        IF (issue_lower LIKE '%screen%' OR issue_lower LIKE '%display%' OR 
            repair_lower LIKE '%screen%' OR repair_lower LIKE '%display%') THEN
            score := 80; -- Laptop screen
        ELSIF (issue_lower LIKE '%battery%' OR repair_lower LIKE '%battery%') THEN
            score := 75; -- Laptop battery
        ELSIF (issue_lower LIKE '%keyboard%' OR repair_lower LIKE '%keyboard%') THEN
            score := 70; -- Laptop keyboard
        ELSE
            score := 60; -- Other laptop repairs
        END IF;
    END IF;
    
    -- LOWER PRIORITY: Motherboard and water damage (30-40)
    IF (issue_lower LIKE '%motherboard%' OR issue_lower LIKE '%logic board%' OR
        issue_lower LIKE '%water damage%' OR issue_lower LIKE '%liquid damage%' OR
        repair_lower LIKE '%motherboard%' OR repair_lower LIKE '%water%') THEN
        score := 35; -- Complex repairs take longer
    END IF;
    
    -- LOWER PRIORITY: Consoles (40-50) - customers expect 1+ day turnaround
    IF (device_lower LIKE '%playstation%' OR device_lower LIKE '%ps4%' OR 
        device_lower LIKE '%ps5%' OR device_lower LIKE '%xbox%' OR 
        device_lower LIKE '%nintendo%' OR device_lower LIKE '%switch%') THEN
        score := 45; -- Console repairs
    END IF;
    
    RETURN score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to auto-update priority score on job changes
CREATE OR REPLACE FUNCTION update_job_priority()
RETURNS TRIGGER AS $$
BEGIN
    -- Only recalculate if relevant fields changed or priority is null
    IF (NEW.priority_score IS NULL OR 
        OLD.device_make IS DISTINCT FROM NEW.device_make OR
        OLD.device_model IS DISTINCT FROM NEW.device_model OR
        OLD.issue IS DISTINCT FROM NEW.issue OR
        OLD.repair_type IS DISTINCT FROM NEW.repair_type) THEN
        
        NEW.priority_score := calculate_priority_score(
            NEW.device_make,
            NEW.device_model,
            NEW.issue,
            NEW.repair_type
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating priority
DROP TRIGGER IF EXISTS set_job_priority ON jobs;
CREATE TRIGGER set_job_priority
    BEFORE INSERT OR UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_job_priority();

-- Function to track collection timestamp
CREATE OR REPLACE FUNCTION track_collection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    -- Set collected_at when status changes to COLLECTED
    IF NEW.status = 'COLLECTED' AND (OLD.status IS NULL OR OLD.status != 'COLLECTED') THEN
        NEW.collected_at := NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for tracking collection
DROP TRIGGER IF EXISTS set_collected_timestamp ON jobs;
CREATE TRIGGER set_collected_timestamp
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION track_collection_timestamp();

-- Function to auto-close jobs 3 days after collection
CREATE OR REPLACE FUNCTION auto_close_collected_jobs()
RETURNS void AS $$
BEGIN
    UPDATE jobs
    SET 
        status = 'COMPLETED',
        closed_at = NOW()
    WHERE 
        status = 'COLLECTED'
        AND collected_at IS NOT NULL
        AND collected_at < NOW() - INTERVAL '3 days'
        AND closed_at IS NULL;
    
    -- Log the auto-closure events
    INSERT INTO job_events (job_id, type, message)
    SELECT 
        id,
        'SYSTEM',
        'Job automatically closed 3 days after collection'
    FROM jobs
    WHERE 
        status = 'COMPLETED'
        AND closed_at >= NOW() - INTERVAL '1 minute'
        AND closed_at IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Backfill collected_at for existing COLLECTED jobs
UPDATE jobs
SET collected_at = updated_at
WHERE status = 'COLLECTED' AND collected_at IS NULL;

-- Backfill priority scores for existing jobs
UPDATE jobs
SET priority_score = calculate_priority_score(device_make, device_model, issue, repair_type)
WHERE priority_score IS NULL OR priority_score = 50;

-- Add comments for documentation
COMMENT ON COLUMN jobs.collected_at IS 'Timestamp when job status changed to COLLECTED';
COMMENT ON COLUMN jobs.closed_at IS 'Timestamp when job was auto-closed or manually completed';
COMMENT ON COLUMN jobs.priority_score IS 'Priority score (0-100): Higher = more urgent. Auto-calculated based on device and repair type';
COMMENT ON COLUMN jobs.customer_flag IS 'Flag for special customer handling (sensitive, awkward, vip, normal)';
COMMENT ON COLUMN jobs.customer_flag_notes IS 'Notes about why customer is flagged';
COMMENT ON COLUMN jobs.skip_review_request IS 'If true, skip sending post-collection review request SMS';
COMMENT ON COLUMN jobs.repair_type IS 'Type of repair (screen, battery, charging, etc.) for priority calculation';
