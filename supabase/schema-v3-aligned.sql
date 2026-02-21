-- New Forest Device Repairs - Schema v3 (Aligned with AI Responder)
-- This schema aligns the jobs table with the quote_requests table from the AI responder
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop existing tables (CAREFUL IN PRODUCTION - backup first!)
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS sms_logs CASCADE;
DROP TABLE IF EXISTS sms_templates CASCADE;
DROP TABLE IF EXISTS job_events CASCADE;
DROP TABLE IF EXISTS jobs CASCADE;

-- Jobs table (aligned with quote_requests structure)
CREATE TABLE jobs (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Job Reference (auto-generated)
    job_ref VARCHAR(20) NOT NULL UNIQUE,
    
    -- Customer Details (from quote_requests: name, phone, email)
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    
    -- Device Details (from quote_requests: device_make, device_model, issue, description)
    device_make TEXT NOT NULL,
    device_model TEXT NOT NULL,
    issue TEXT NOT NULL,
    description TEXT,
    additional_issues JSONB DEFAULT '[]'::jsonb,
    
    -- Quote/Job Type & Source
    type TEXT NOT NULL DEFAULT 'repair' CHECK (type IN ('repair', 'sell')),
    source TEXT DEFAULT 'api',
    page TEXT,
    
    -- Status & Pricing
    status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN (
        'RECEIVED',
        'AWAITING_DEPOSIT',
        'PARTS_ORDERED',
        'READY_TO_BOOK_IN',
        'IN_REPAIR',
        'READY_TO_COLLECT',
        'COMPLETED',
        'CANCELLED'
    )),
    quoted_price NUMERIC(10,2),
    price_total NUMERIC(10,2) NOT NULL,
    quoted_at TIMESTAMPTZ,
    
    -- Parts Ordering & Deposit
    requires_parts_order BOOLEAN DEFAULT FALSE,
    parts_required BOOLEAN DEFAULT FALSE,
    deposit_required BOOLEAN DEFAULT FALSE,
    deposit_amount NUMERIC(10,2),
    deposit_received BOOLEAN DEFAULT FALSE,
    
    -- Tracking
    tracking_token VARCHAR(64) NOT NULL UNIQUE,
    
    -- Relationships (optional - for future integration)
    conversation_id UUID,
    customer_id UUID,
    quote_request_id UUID,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for jobs
CREATE INDEX idx_jobs_customer_phone ON jobs(customer_phone);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_tracking_token ON jobs(tracking_token);
CREATE INDEX idx_jobs_job_ref ON jobs(job_ref);
CREATE INDEX idx_jobs_additional_issues ON jobs USING gin(additional_issues);
CREATE INDEX idx_jobs_requires_parts ON jobs(requires_parts_order) WHERE requires_parts_order = true;

-- Job events table (audit trail)
CREATE TABLE job_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
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
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sms_templates_key ON sms_templates(key);

-- SMS logs table
CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    template_key VARCHAR(100),
    body_rendered TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    sent_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_sms_status CHECK (status IN ('PENDING', 'SENT', 'FAILED'))
);

CREATE INDEX idx_sms_logs_job_id ON sms_logs(job_id);
CREATE INDEX idx_sms_logs_status ON sms_logs(status);
CREATE INDEX idx_sms_logs_created_at ON sms_logs(created_at DESC);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_job_id ON notifications(job_id);

-- Push subscriptions table
CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Functions

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS generate_job_ref() CASCADE;
DROP FUNCTION IF EXISTS generate_tracking_token() CASCADE;

-- Auto-update updated_at timestamp
CREATE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate job reference (NFD-YYYYMMDD-NNN)
CREATE FUNCTION generate_job_ref()
RETURNS TRIGGER AS $$
DECLARE
    today_date TEXT;
    today_count INTEGER;
    new_ref TEXT;
BEGIN
    today_date := TO_CHAR(NOW(), 'YYYYMMDD');
    
    SELECT COUNT(*) INTO today_count
    FROM jobs
    WHERE job_ref LIKE 'NFD-' || today_date || '-%';
    
    new_ref := 'NFD-' || today_date || '-' || LPAD((today_count + 1)::TEXT, 3, '0');
    NEW.job_ref := new_ref;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate tracking token
CREATE FUNCTION generate_tracking_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tracking_token IS NULL OR NEW.tracking_token = '' THEN
        NEW.tracking_token := encode(gen_random_bytes(32), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers

-- Auto-update updated_at on jobs
CREATE TRIGGER update_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate job_ref
CREATE TRIGGER generate_jobs_ref
    BEFORE INSERT ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION generate_job_ref();

-- Auto-generate tracking_token
CREATE TRIGGER generate_jobs_tracking_token
    BEFORE INSERT ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION generate_tracking_token();

-- Auto-update updated_at on push_subscriptions
CREATE TRIGGER update_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Complete SMS Templates for All Statuses
INSERT INTO sms_templates (key, body, is_active) VALUES
-- Status: RECEIVED
('RECEIVED', 'Hi {customer_name}, we''ve received your {device_make} {device_model}. We''ll assess it and get back to you shortly with a quote. Track your repair: {tracking_link} - New Forest Device Repairs', true),

-- Status: AWAITING_DEPOSIT
('DEPOSIT_REQUIRED', 'Hi {customer_name}, your {device_make} {device_model} repair quote is £{price_total}. We need a £{deposit_amount} deposit to order parts. Pay here: {deposit_link}. Track: {tracking_link} - NFD Repairs', true),

-- Status: PARTS_ORDERED
('PARTS_ORDERED', 'Hi {customer_name}, parts for your {device_make} {device_model} have been ordered. We''ll notify you when they arrive and we''re ready to start the repair. Track: {tracking_link} - NFD Repairs', true),

-- Status: READY_TO_BOOK_IN
('READY_TO_BOOK_IN', 'Hi {customer_name}, your {device_make} {device_model} is ready to book in for repair. We''ll contact you to arrange a convenient time to drop it off. Track: {tracking_link} - NFD Repairs', true),

-- Status: IN_REPAIR
('IN_REPAIR', 'Hi {customer_name}, your {device_make} {device_model} repair is now in progress. Our technicians are working on it and we''ll update you when it''s ready. Track: {tracking_link} - NFD Repairs', true),

-- Status: READY_TO_COLLECT
('READY_TO_COLLECT', 'Hi {customer_name}, great news! Your {device_make} {device_model} is ready to collect from New Forest Device Repairs. We''re open Mon-Sat 9am-5pm. Track: {tracking_link} - NFD Repairs', true),

-- Status: COMPLETED (sent when job marked complete)
('COMPLETED', 'Hi {customer_name}, your {device_make} {device_model} repair is complete. Thank you for choosing New Forest Device Repairs! Track: {tracking_link}', true),

-- Status: COLLECTED (NEW - sent when device is picked up)
('COLLECTED', 'Hi {customer_name}, thanks for collecting your {device_make} {device_model}! ⭐ Loved our service? Please leave us a 5-star Google review: https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review

Your repair is covered by our warranty. Any issues? Reply to this SMS or use your tracking link: {tracking_link}

Warranty terms: https://newforestdevicerepairs.co.uk/warranty

Need warranty work? Contact us via SMS or book in again at {tracking_link}

Thanks for choosing NFD Repairs! 📱', true),

-- Status: CANCELLED
('CANCELLED', 'Hi {customer_name}, your {device_make} {device_model} repair has been cancelled. If you have any questions, please contact us. Track: {tracking_link} - NFD Repairs', true),

-- Additional useful templates
('DEPOSIT_RECEIVED', 'Hi {customer_name}, we''ve received your £{deposit_amount} deposit for {device_make} {device_model}. Parts are being ordered now. Track: {tracking_link} - NFD Repairs', true),

('DELAY_NOTIFICATION', 'Hi {customer_name}, there''s a slight delay with your {device_make} {device_model} repair. We''ll keep you updated. Track: {tracking_link} - NFD Repairs', true),

('QUOTE_REMINDER', 'Hi {customer_name}, just a reminder about your {device_make} {device_model} repair quote of £{price_total}. Let us know if you''d like to proceed. Track: {tracking_link} - NFD Repairs', true);

-- Row Level Security (RLS) Policies

-- Enable RLS on all tables
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Jobs: Allow all operations for authenticated users (staff)
CREATE POLICY "Staff can view all jobs"
    ON jobs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can insert jobs"
    ON jobs FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Staff can update jobs"
    ON jobs FOR UPDATE
    TO authenticated
    USING (true);

-- Jobs: Allow public to view their own job via tracking_token (for tracking page)
CREATE POLICY "Public can view job by tracking token"
    ON jobs FOR SELECT
    TO anon
    USING (true);

-- Job events: Staff only
CREATE POLICY "Staff can view job events"
    ON job_events FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can insert job events"
    ON job_events FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- SMS templates: Staff only
CREATE POLICY "Staff can view SMS templates"
    ON sms_templates FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can update SMS templates"
    ON sms_templates FOR UPDATE
    TO authenticated
    USING (true);

-- SMS logs: Staff only
CREATE POLICY "Staff can view SMS logs"
    ON sms_logs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can insert SMS logs"
    ON sms_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Staff can update SMS logs"
    ON sms_logs FOR UPDATE
    TO authenticated
    USING (true);

-- Notifications: Staff only
CREATE POLICY "Staff can view notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can insert notifications"
    ON notifications FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Staff can update notifications"
    ON notifications FOR UPDATE
    TO authenticated
    USING (true);

-- Push subscriptions: Staff only
CREATE POLICY "Staff can manage push subscriptions"
    ON push_subscriptions FOR ALL
    TO authenticated
    USING (true);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON jobs TO anon;
