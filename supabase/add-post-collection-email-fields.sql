    -- ============================================
    -- ADD POST-COLLECTION EMAIL TRACKING FIELDS
    -- ============================================
    -- Adds fields to track post-collection emails alongside SMS

    -- Add email tracking columns to jobs table
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS post_collection_email_scheduled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS post_collection_email_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS post_collection_email_delivery_status VARCHAR(50),
    ADD COLUMN IF NOT EXISTS post_collection_email_subject TEXT,
    ADD COLUMN IF NOT EXISTS post_collection_email_body TEXT;

    -- Add indexes for performance
    CREATE INDEX IF NOT EXISTS idx_jobs_post_collection_email_scheduled 
    ON jobs(post_collection_email_scheduled_at) 
    WHERE post_collection_email_sent_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_jobs_post_collection_email_sent 
    ON jobs(post_collection_email_sent_at);

    -- Add comments
    COMMENT ON COLUMN jobs.post_collection_email_scheduled_at IS 'When post-collection email is scheduled to be sent';
    COMMENT ON COLUMN jobs.post_collection_email_sent_at IS 'When post-collection email was actually sent';
    COMMENT ON COLUMN jobs.post_collection_email_delivery_status IS 'Email delivery status: SENT, FAILED, SKIPPED_DUPLICATE';
    COMMENT ON COLUMN jobs.post_collection_email_subject IS 'Subject line of sent email';
    COMMENT ON COLUMN jobs.post_collection_email_body IS 'Full HTML body of sent email (for record keeping)';

    -- Verify columns were added
    SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
        AND table_name = 'jobs'
        AND column_name LIKE 'post_collection_email%'
    ORDER BY column_name;
