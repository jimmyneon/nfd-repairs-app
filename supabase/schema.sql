-- New Forest Device Repairs - Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Repairs table
CREATE TABLE repairs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Customer information
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50),
    
    -- Device information
    device_type VARCHAR(100) NOT NULL,
    device_model VARCHAR(255) NOT NULL,
    issue_description TEXT NOT NULL,
    
    -- Repair status
    status VARCHAR(50) NOT NULL DEFAULT 'received',
    
    -- Timeline
    estimated_completion TIMESTAMP WITH TIME ZONE,
    actual_completion TIMESTAMP WITH TIME ZONE,
    
    -- Pricing
    cost_estimate DECIMAL(10, 2),
    final_cost DECIMAL(10, 2),
    
    -- Warranty
    warranty_expiry TIMESTAMP WITH TIME ZONE,
    
    -- Notes
    notes TEXT,
    internal_notes TEXT,
    
    -- Indexes
    CONSTRAINT valid_status CHECK (status IN (
        'received',
        'diagnosing',
        'awaiting_parts',
        'repairing',
        'testing',
        'completed',
        'ready_for_collection',
        'collected'
    ))
);

-- Create index on customer email for faster lookups
CREATE INDEX idx_repairs_customer_email ON repairs(customer_email);
CREATE INDEX idx_repairs_status ON repairs(status);
CREATE INDEX idx_repairs_created_at ON repairs(created_at DESC);

-- Repair updates table
CREATE TABLE repair_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repair_id UUID NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    status VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_customer_visible BOOLEAN DEFAULT true,
    
    -- Indexes
    CONSTRAINT fk_repair FOREIGN KEY (repair_id) REFERENCES repairs(id)
);

CREATE INDEX idx_repair_updates_repair_id ON repair_updates(repair_id);
CREATE INDEX idx_repair_updates_created_at ON repair_updates(created_at DESC);

-- Issues table (for warranty claims and quality concerns)
CREATE TABLE issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repair_id UUID NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    issue_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    resolution TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT valid_issue_type CHECK (issue_type IN (
        'warranty_claim',
        'quality_concern',
        'other'
    )),
    CONSTRAINT valid_issue_status CHECK (status IN (
        'open',
        'investigating',
        'resolved',
        'closed'
    ))
);

CREATE INDEX idx_issues_repair_id ON issues(repair_id);
CREATE INDEX idx_issues_status ON issues(status);

-- Magic links table (for authentication)
CREATE TABLE magic_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    repair_id UUID NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT false
);

CREATE INDEX idx_magic_links_token ON magic_links(token);
CREATE INDEX idx_magic_links_repair_id ON magic_links(repair_id);
CREATE INDEX idx_magic_links_expires_at ON magic_links(expires_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_repairs_updated_at BEFORE UPDATE ON repairs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
-- Note: You may want to adjust these based on your security requirements

ALTER TABLE repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE magic_links ENABLE ROW LEVEL SECURITY;

-- Allow public read access to repairs (we'll handle auth via magic links in the app)
CREATE POLICY "Allow public read access to repairs" ON repairs
    FOR SELECT USING (true);

-- Allow public read access to customer-visible updates
CREATE POLICY "Allow public read access to customer updates" ON repair_updates
    FOR SELECT USING (is_customer_visible = true);

-- Allow public read access to issues
CREATE POLICY "Allow public read access to issues" ON issues
    FOR SELECT USING (true);

-- Allow public read access to magic links (for verification)
CREATE POLICY "Allow public read access to magic links" ON magic_links
    FOR SELECT USING (true);

-- Sample data (optional - for testing)
INSERT INTO repairs (
    customer_email,
    customer_name,
    customer_phone,
    device_type,
    device_model,
    issue_description,
    status,
    estimated_completion,
    cost_estimate,
    warranty_expiry,
    notes
) VALUES (
    'test@example.com',
    'John Smith',
    '07410381247',
    'iPhone',
    'iPhone 13 Pro',
    'Cracked screen, needs replacement',
    'repairing',
    NOW() + INTERVAL '2 days',
    89.99,
    NOW() + INTERVAL '90 days',
    'Screen replacement includes 90-day warranty'
);

-- Add some updates for the sample repair
INSERT INTO repair_updates (repair_id, status, message, is_customer_visible)
SELECT 
    id,
    'received',
    'Your device has been received and logged into our system.',
    true
FROM repairs WHERE customer_email = 'test@example.com'
LIMIT 1;

INSERT INTO repair_updates (repair_id, status, message, is_customer_visible)
SELECT 
    id,
    'diagnosing',
    'Our technician is currently assessing the damage.',
    true
FROM repairs WHERE customer_email = 'test@example.com'
LIMIT 1;

INSERT INTO repair_updates (repair_id, status, message, is_customer_visible)
SELECT 
    id,
    'repairing',
    'Screen replacement in progress. Expected completion in 24 hours.',
    true
FROM repairs WHERE customer_email = 'test@example.com'
LIMIT 1;
