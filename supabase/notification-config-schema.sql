-- Notification Configuration Schema
-- Allows controlling which notifications (email/SMS/both) are sent for each status

-- Drop existing tables if they exist
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS notification_config CASCADE;

-- Notification configuration table
-- Controls which notification types are sent for each status change
CREATE TABLE notification_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status_key VARCHAR(50) NOT NULL UNIQUE,
    status_label VARCHAR(100) NOT NULL,
    send_sms BOOLEAN DEFAULT true,
    send_email BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_status_key CHECK (status_key IN (
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

-- Email templates table
-- Stores customizable email templates for each status
CREATE TABLE email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notification_config_status ON notification_config(status_key);
CREATE INDEX idx_notification_config_active ON notification_config(is_active);
CREATE INDEX idx_email_templates_key ON email_templates(key);
CREATE INDEX idx_email_templates_active ON email_templates(is_active);

-- Auto-update updated_at trigger
CREATE TRIGGER update_notification_config_updated_at
    BEFORE UPDATE ON notification_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
    BEFORE UPDATE ON email_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert default notification configuration
INSERT INTO notification_config (status_key, status_label, send_sms, send_email, is_active, description) VALUES
('RECEIVED', 'Received', true, true, true, 'Job first created and received'),
('AWAITING_DEPOSIT', 'Awaiting Deposit', true, true, true, 'Deposit required to order parts'),
('PARTS_ORDERED', 'Parts Ordered', true, true, true, 'Parts have been ordered'),
('READY_TO_BOOK_IN', 'Ready to Book In', true, true, true, 'Device ready to be booked in for repair'),
('IN_REPAIR', 'In Repair', true, true, true, 'Repair work in progress'),
('READY_TO_COLLECT', 'Ready to Collect', true, true, true, 'Repair complete, ready for pickup'),
('COMPLETED', 'Completed', true, true, true, 'Job marked as completed'),
('CANCELLED', 'Cancelled', true, false, true, 'Job cancelled - SMS only by default');

-- Insert default email templates
INSERT INTO email_templates (key, subject, body_html, body_text, is_active) VALUES
('JOB_CREATED', 'Job Created: {job_ref} - {device_make} {device_model}', 
'<!-- Will be generated dynamically with embedded tracking -->', 
'Job created for {device_make} {device_model}. Track at {tracking_link}', 
true),

('STATUS_UPDATE', 'Status Update: {job_ref} - {status_label}',
'<!-- Will be generated dynamically with embedded tracking -->',
'Your {device_make} {device_model} repair status: {status_label}. Track at {tracking_link}',
true);

-- RLS Policies
ALTER TABLE notification_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Staff can view and manage notification config
CREATE POLICY "Staff can view notification config"
    ON notification_config FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can update notification config"
    ON notification_config FOR UPDATE
    TO authenticated
    USING (true);

-- Staff can view and manage email templates
CREATE POLICY "Staff can view email templates"
    ON email_templates FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can update email templates"
    ON email_templates FOR UPDATE
    TO authenticated
    USING (true);

-- Grant permissions
GRANT ALL ON notification_config TO authenticated;
GRANT ALL ON email_templates TO authenticated;

-- Comments
COMMENT ON TABLE notification_config IS 'Controls which notification types (email/SMS) are sent for each status change';
COMMENT ON TABLE email_templates IS 'Customizable email templates with embedded job tracking';
COMMENT ON COLUMN notification_config.send_sms IS 'Whether to send SMS for this status change';
COMMENT ON COLUMN notification_config.send_email IS 'Whether to send email for this status change';
