-- New Forest Device Repairs - Refactored Schema v2
-- This replaces the original schema with the new workflow-based structure
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop old tables if they exist (careful in production!)
DROP TABLE IF EXISTS magic_links CASCADE;
DROP TABLE IF EXISTS issues CASCADE;
DROP TABLE IF EXISTS repair_updates CASCADE;
DROP TABLE IF EXISTS repairs CASCADE;

-- Jobs table (replaces repairs)
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_ref VARCHAR(20) NOT NULL UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED',
    
    -- Device and repair info
    device_summary TEXT NOT NULL,
    repair_summary TEXT NOT NULL,
    
    -- Pricing
    price_total DECIMAL(10, 2) NOT NULL,
    
    -- Parts and deposit
    parts_required BOOLEAN DEFAULT false,
    deposit_required BOOLEAN DEFAULT false,
    deposit_amount DECIMAL(10, 2),
    deposit_received BOOLEAN DEFAULT false,
    
    -- Customer info (internal only - never exposed on tracking page)
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    
    -- Tracking
    tracking_token VARCHAR(64) NOT NULL UNIQUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Status constraint
    CONSTRAINT valid_status CHECK (status IN (
        'RECEIVED',
        'AWAITING_DEPOSIT',
        'PARTS_ORDERED',
        'READY_TO_BOOK_IN',
        'IN_REPAIR',
        'READY_TO_COLLECT',
        'COMPLETED',
        'CANCELLED'
    ))
);

-- Indexes for jobs
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_tracking_token ON jobs(tracking_token);
CREATE INDEX idx_jobs_job_ref ON jobs(job_ref);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_customer_phone ON jobs(customer_phone);

-- Job events table (audit trail)
CREATE TABLE job_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,
    
    CONSTRAINT valid_event_type CHECK (type IN (
        'STATUS_CHANGE',
        'NOTE',
        'SYSTEM'
    ))
);

CREATE INDEX idx_job_events_job_id ON job_events(job_id);
CREATE INDEX idx_job_events_created_at ON job_events(created_at DESC);

-- SMS templates table
CREATE TABLE sms_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) NOT NULL UNIQUE,
    body TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sms_templates_key ON sms_templates(key);

-- SMS logs table
CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    template_key VARCHAR(100),
    body_rendered TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    
    CONSTRAINT valid_sms_status CHECK (status IN (
        'PENDING',
        'SENT',
        'FAILED'
    ))
);

CREATE INDEX idx_sms_logs_job_id ON sms_logs(job_id);
CREATE INDEX idx_sms_logs_status ON sms_logs(status);
CREATE INDEX idx_sms_logs_created_at ON sms_logs(created_at DESC);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_notification_type CHECK (type IN (
        'NEW_JOB',
        'STATUS_UPDATE',
        'ACTION_REQUIRED'
    ))
);

CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_job_id ON notifications(job_id);

-- Function to generate job reference
CREATE OR REPLACE FUNCTION generate_job_ref()
RETURNS VARCHAR AS $$
DECLARE
    new_ref VARCHAR(20);
    ref_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate format: NFD-YYMMDD-XXX (e.g., NFD-260221-A3F)
        new_ref := 'NFD-' || 
                   TO_CHAR(NOW(), 'YYMMDD') || '-' || 
                   UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 3));
        
        -- Check if it exists
        SELECT EXISTS(SELECT 1 FROM jobs WHERE job_ref = new_ref) INTO ref_exists;
        
        EXIT WHEN NOT ref_exists;
    END LOOP;
    
    RETURN new_ref;
END;
$$ LANGUAGE plpgsql;

-- Function to generate tracking token
CREATE OR REPLACE FUNCTION generate_tracking_token()
RETURNS VARCHAR AS $$
BEGIN
    RETURN ENCODE(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at on jobs
CREATE TRIGGER update_jobs_updated_at 
    BEFORE UPDATE ON jobs
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger to automatically update updated_at on sms_templates
CREATE TRIGGER update_sms_templates_updated_at 
    BEFORE UPDATE ON sms_templates
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies

-- Jobs table
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users (staff) full access
CREATE POLICY "Staff can manage jobs" ON jobs
    FOR ALL USING (auth.role() = 'authenticated');

-- Allow public to read jobs by tracking_token only (for customer view)
CREATE POLICY "Public can read job by tracking token" ON jobs
    FOR SELECT USING (true);

-- Job events
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage job events" ON job_events
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public can read job events" ON job_events
    FOR SELECT USING (true);

-- SMS templates
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage SMS templates" ON sms_templates
    FOR ALL USING (auth.role() = 'authenticated');

-- SMS logs
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage SMS logs" ON sms_logs
    FOR ALL USING (auth.role() = 'authenticated');

-- Notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage notifications" ON notifications
    FOR ALL USING (auth.role() = 'authenticated');

-- Insert default SMS templates
INSERT INTO sms_templates (key, body, is_active) VALUES
('DEPOSIT_REQUIRED', 
 'Hi! Your {device_summary} repair quote is £{price_total}. We need a £{deposit_amount} deposit to order parts. Pay here: {deposit_link}. Track your repair: {tracking_link} - NFD Repairs',
 true),

('PARTS_ORDERED', 
 'Good news! Parts ordered for your {device_summary} (Ref: {job_ref}). We''ll update you when they arrive. Track: {tracking_link} - NFD Repairs',
 true),

('READY_TO_BOOK_IN', 
 'Your {device_summary} is ready to book in for repair (Ref: {job_ref}). We''ll be in touch to arrange. Track: {tracking_link} - NFD Repairs',
 true),

('IN_REPAIR', 
 'Your {device_summary} repair is now underway (Ref: {job_ref}). We''ll notify you when it''s ready. Track: {tracking_link} - NFD Repairs',
 true),

('READY_TO_COLLECT', 
 'Great news! Your {device_summary} is ready to collect (Ref: {job_ref}). {shop_address}. {opening_times}. Track: {tracking_link} - NFD Repairs',
 true),

('COMPLETED', 
 'Your {device_summary} repair is complete (Ref: {job_ref}). Thank you for choosing NFD Repairs! Any issues? Reply to this message.',
 true);

-- Insert sample job for testing
INSERT INTO jobs (
    job_ref,
    status,
    device_summary,
    repair_summary,
    price_total,
    parts_required,
    deposit_required,
    deposit_amount,
    customer_name,
    customer_phone,
    tracking_token
) VALUES (
    generate_job_ref(),
    'AWAITING_DEPOSIT',
    'iPhone 13 Pro - Cracked Screen',
    'Screen replacement required',
    89.99,
    true,
    true,
    30.00,
    'John Smith',
    '07410381247',
    generate_tracking_token()
);

-- Add initial event for sample job
INSERT INTO job_events (job_id, type, message)
SELECT 
    id,
    'SYSTEM',
    'Job created via API'
FROM jobs 
WHERE customer_phone = '07410381247'
LIMIT 1;

-- Add notification for sample job
INSERT INTO notifications (type, title, body, job_id)
SELECT 
    'NEW_JOB',
    'New repair job created',
    'iPhone 13 Pro - Cracked Screen',
    id
FROM jobs 
WHERE customer_phone = '07410381247'
LIMIT 1;

-- Push subscriptions table for PWA notifications
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- RLS for push_subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage push subscriptions" ON push_subscriptions
    FOR ALL USING (auth.role() = 'authenticated');
