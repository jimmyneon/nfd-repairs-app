-- Add toggle to control whether tracking info is shown to customer
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS show_tracking_to_customer BOOLEAN DEFAULT FALSE;
