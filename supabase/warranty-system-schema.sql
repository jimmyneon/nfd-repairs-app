-- Warranty Ticket System & Post-Collection SMS Schema
-- Run this in Supabase SQL Editor

-- Add post-collection SMS tracking to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS post_collection_sms_scheduled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS post_collection_sms_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS post_collection_sms_delivery_status TEXT,
ADD COLUMN IF NOT EXISTS post_collection_sms_body TEXT;

-- Create warranty_tickets table
CREATE TABLE IF NOT EXISTS warranty_tickets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Ticket identification
    ticket_ref VARCHAR(20) NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN (
        'NEW',
        'NEEDS_ATTENTION',
        'IN_PROGRESS',
        'RESOLVED',
        'CLOSED'
    )),
    
    -- Source tracking
    source TEXT NOT NULL DEFAULT 'website' CHECK (source IN (
        'website',
        'sms_reply',
        'manual',
        'api'
    )),
    submitted_at TIMESTAMPTZ NOT NULL,
    
    -- Customer information
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    
    -- Repair/Job matching
    matched_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    match_confidence TEXT CHECK (match_confidence IN ('high', 'medium', 'low', 'none')),
    job_reference TEXT,
    device_model TEXT,
    
    -- Issue details
    issue_description TEXT NOT NULL,
    issue_category TEXT,
    
    -- Attachments (stored as JSONB array)
    attachments JSONB DEFAULT '[]'::jsonb,
    
    -- Metadata
    ip_address TEXT,
    user_agent TEXT,
    idempotency_key TEXT UNIQUE,
    
    -- SMS reply tracking
    sms_thread_id TEXT,
    inbound_messages JSONB DEFAULT '[]'::jsonb,
    
    -- Staff assignment
    assigned_to UUID,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID,
    resolution_notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create warranty_ticket_events table (audit trail)
CREATE TABLE IF NOT EXISTS warranty_ticket_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES warranty_tickets(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    
    CONSTRAINT valid_ticket_event_type CHECK (type IN (
        'STATUS_CHANGE',
        'NOTE',
        'SMS_RECEIVED',
        'ASSIGNED',
        'RESOLVED',
        'SYSTEM'
    ))
);

-- Create admin_settings table for configuration
CREATE TABLE IF NOT EXISTS admin_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID
);

-- Insert default Google review link setting
INSERT INTO admin_settings (key, value, description) VALUES
('google_review_link', 'https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review', 'Google review link for post-collection SMS')
ON CONFLICT (key) DO NOTHING;

-- Insert API key for website integration
INSERT INTO admin_settings (key, value, description) VALUES
('warranty_api_key', encode(gen_random_bytes(32), 'hex'), 'API key for warranty ticket creation from website')
ON CONFLICT (key) DO NOTHING;

-- Indexes for warranty_tickets
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_status ON warranty_tickets(status);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_customer_phone ON warranty_tickets(customer_phone);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_matched_job_id ON warranty_tickets(matched_job_id);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_created_at ON warranty_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_idempotency_key ON warranty_tickets(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_warranty_tickets_sms_thread_id ON warranty_tickets(sms_thread_id);

-- Indexes for warranty_ticket_events
CREATE INDEX IF NOT EXISTS idx_warranty_ticket_events_ticket_id ON warranty_ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_warranty_ticket_events_created_at ON warranty_ticket_events(created_at DESC);

-- Indexes for jobs post-collection SMS
CREATE INDEX IF NOT EXISTS idx_jobs_post_collection_sms_scheduled ON jobs(post_collection_sms_scheduled_at) 
    WHERE post_collection_sms_sent_at IS NULL;

-- Function to auto-generate ticket reference
CREATE OR REPLACE FUNCTION generate_ticket_ref()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ticket_ref IS NULL OR NEW.ticket_ref = '' THEN
        NEW.ticket_ref := 'WRT-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                         LPAD(NEXTVAL('warranty_ticket_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create sequence for ticket references
CREATE SEQUENCE IF NOT EXISTS warranty_ticket_seq START 1;

-- Create trigger for auto-generating ticket references
DROP TRIGGER IF EXISTS set_warranty_ticket_ref ON warranty_tickets;
CREATE TRIGGER set_warranty_ticket_ref
    BEFORE INSERT ON warranty_tickets
    FOR EACH ROW
    EXECUTE FUNCTION generate_ticket_ref();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for warranty_tickets updated_at
DROP TRIGGER IF EXISTS update_warranty_tickets_updated_at ON warranty_tickets;
CREATE TRIGGER update_warranty_tickets_updated_at
    BEFORE UPDATE ON warranty_tickets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for admin_settings updated_at
DROP TRIGGER IF EXISTS update_admin_settings_updated_at ON admin_settings;
CREATE TRIGGER update_admin_settings_updated_at
    BEFORE UPDATE ON admin_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE warranty_tickets IS 'Warranty and support tickets from website or SMS replies';
COMMENT ON TABLE warranty_ticket_events IS 'Audit trail for warranty ticket changes';
COMMENT ON TABLE admin_settings IS 'Application configuration settings';
COMMENT ON COLUMN jobs.post_collection_sms_scheduled_at IS 'When post-collection review SMS is scheduled to send';
COMMENT ON COLUMN jobs.post_collection_sms_sent_at IS 'When post-collection review SMS was actually sent';
COMMENT ON COLUMN jobs.post_collection_sms_delivery_status IS 'Delivery status of post-collection SMS';
COMMENT ON COLUMN jobs.post_collection_sms_body IS 'Body of the post-collection SMS that was sent';
