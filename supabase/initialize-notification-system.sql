-- Initialize complete notification system with email templates and configuration
-- Run this to set up the notification system if tables don't exist

-- Create notification_config table if it doesn't exist
CREATE TABLE IF NOT EXISTS notification_config (
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
        'PARTS_ARRIVED',
        'READY_TO_BOOK_IN',
        'IN_REPAIR',
        'DELAYED',
        'READY_TO_COLLECT',
        'COMPLETED',
        'CANCELLED'
    ))
);

-- Create email_templates table if it doesn't exist
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status_key VARCHAR(50) NOT NULL UNIQUE,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert or update notification configuration
INSERT INTO notification_config (status_key, status_label, send_sms, send_email, is_active, description) VALUES
('RECEIVED', 'Received', true, true, true, 'Job first created and received'),
('AWAITING_DEPOSIT', 'Awaiting Deposit', true, true, true, 'Deposit required to order parts'),
('PARTS_ORDERED', 'Parts Ordered', true, true, true, 'Parts have been ordered'),
('PARTS_ARRIVED', 'Parts Arrived', true, true, true, 'Parts arrived - customer should drop device off'),
('READY_TO_BOOK_IN', 'Ready to Book In', true, true, true, 'Device ready to be booked in for repair'),
('IN_REPAIR', 'In Repair', true, true, true, 'Repair work in progress'),
('DELAYED', 'Delayed', true, true, true, 'Repair delayed - customer will be notified'),
('READY_TO_COLLECT', 'Ready to Collect', true, true, true, 'Repair complete, ready for pickup'),
('COMPLETED', 'Completed', true, true, true, 'Job marked as completed'),
('CANCELLED', 'Cancelled', true, false, true, 'Job cancelled - SMS only by default')
ON CONFLICT (status_key) DO UPDATE SET
    status_label = EXCLUDED.status_label,
    description = EXCLUDED.description;

-- Insert or update email templates with proper HTML
INSERT INTO email_templates (status_key, subject, body_html, body_text, is_active) VALUES
('RECEIVED', 'Job Received: {job_ref}', 
'<h2>We''ve received your device</h2><p>Your {device_make} {device_model} has been received and will be assessed shortly.</p><p><a href="{tracking_link}">Track your repair</a></p>',
'We have received your {device_make} {device_model}. Track at {tracking_link}',
true),

('AWAITING_DEPOSIT', 'Deposit Required: {job_ref}', 
'<h2>Deposit Required</h2><p>We need a £20 deposit to order parts for your {device_make} {device_model}.</p><p><a href="{deposit_link}">Pay Deposit Now</a></p><p><a href="{tracking_link}">Track your repair</a></p>',
'Deposit required for {device_make} {device_model}. Pay at {deposit_link}. Track at {tracking_link}',
true),

('PARTS_ORDERED', 'Parts Ordered: {job_ref}', 
'<h2>Parts Ordered</h2><p>We''ve ordered the parts for your {device_make} {device_model}. We''ll notify you when they arrive.</p><p><a href="{tracking_link}">Track your repair</a></p>',
'Parts ordered for {device_make} {device_model}. Track at {tracking_link}',
true),

('PARTS_ARRIVED', 'Parts Arrived - Please Drop Off: {job_ref}', 
'<h2>Parts Have Arrived!</h2><p>The parts for your {device_make} {device_model} have arrived.</p><p><strong>Please drop your device off at:</strong><br>New Forest Device Repairs</p><p><a href="{google_maps_link}">Get Directions</a></p><p>Opening Hours: Mon-Sat 9am-5pm</p><p><a href="{tracking_link}">Track your repair</a></p>',
'Parts arrived for {device_make} {device_model}. Please drop off at New Forest Device Repairs. Find us: {google_maps_link} Track at {tracking_link}',
true),

('READY_TO_BOOK_IN', 'Ready to Book In: {job_ref}', 
'<h2>Ready to Book In</h2><p>Your {device_make} {device_model} is ready to be booked in for repair. We''ll contact you to arrange a convenient time.</p><p><a href="{tracking_link}">Track your repair</a></p>',
'Your {device_make} {device_model} is ready to book in. Track at {tracking_link}',
true),

('IN_REPAIR', 'Repair In Progress: {job_ref}', 
'<h2>Repair In Progress</h2><p>Our technicians are working on your {device_make} {device_model}. We''ll update you when it''s ready.</p><p><a href="{tracking_link}">Track your repair</a></p>',
'Your {device_make} {device_model} is being repaired. Track at {tracking_link}',
true),

('DELAYED', 'Repair Delayed: {job_ref}', 
'<h2>Repair Delayed</h2><p>We''re experiencing a delay with your {device_make} {device_model} repair. We''ll contact you with more information.</p><p><a href="{tracking_link}">Track your repair</a></p>',
'Your {device_make} {device_model} repair is delayed. Track at {tracking_link}',
true),

('READY_TO_COLLECT', 'Ready to Collect: {job_ref}', 
'<h2>Your Repair is Complete!</h2><p>Great news! Your {device_make} {device_model} is ready to collect.</p><p><strong>Collection Details:</strong><br>New Forest Device Repairs<br>Mon-Sat 9am-5pm</p><p><a href="{google_maps_link}">Get Directions</a></p><p><a href="{tracking_link}">Track your repair</a></p>',
'Your {device_make} {device_model} is ready to collect at New Forest Device Repairs. Mon-Sat 9am-5pm. Find us: {google_maps_link} Track at {tracking_link}',
true),

('COMPLETED', 'Repair Completed: {job_ref}', 
'<h2>Thank You!</h2><p>Your {device_make} {device_model} repair is complete. Thank you for choosing New Forest Device Repairs!</p><p><a href="{tracking_link}">View Details</a></p>',
'Your {device_make} {device_model} repair is complete. Thank you!',
true),

('CANCELLED', 'Repair Cancelled: {job_ref}', 
'<h2>Repair Cancelled</h2><p>Your {device_make} {device_model} repair has been cancelled. If you have any questions, please contact us.</p>',
'Your {device_make} {device_model} repair has been cancelled.',
true)
ON CONFLICT (status_key) DO UPDATE SET
    subject = EXCLUDED.subject,
    body_html = EXCLUDED.body_html,
    body_text = EXCLUDED.body_text;

-- Enable RLS
ALTER TABLE notification_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Create policies if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_config' AND policyname = 'Staff can view notification config') THEN
        CREATE POLICY "Staff can view notification config" ON notification_config FOR SELECT TO authenticated USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_config' AND policyname = 'Staff can update notification config') THEN
        CREATE POLICY "Staff can update notification config" ON notification_config FOR UPDATE TO authenticated USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_templates' AND policyname = 'Staff can view email templates') THEN
        CREATE POLICY "Staff can view email templates" ON email_templates FOR SELECT TO authenticated USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_templates' AND policyname = 'Staff can update email templates') THEN
        CREATE POLICY "Staff can update email templates" ON email_templates FOR UPDATE TO authenticated USING (true);
    END IF;
END $$;

-- Grant permissions
GRANT ALL ON notification_config TO authenticated;
GRANT ALL ON email_templates TO authenticated;
