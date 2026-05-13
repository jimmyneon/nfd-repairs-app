-- Add enquiries table for web services and home services quote requests
-- This allows staff to review and approve quote requests before proceeding

CREATE TABLE IF NOT EXISTS enquiries (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Enquiry Reference (auto-generated)
    enquiry_ref VARCHAR(20) NOT NULL UNIQUE,
    
    -- Enquiry Type
    enquiry_type TEXT NOT NULL CHECK (enquiry_type IN ('web_services', 'home_services')),
    
    -- Customer Details
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    
    -- Web Services Specific Fields
    project_type TEXT,
    sector TEXT,
    number_pages TEXT,
    goals TEXT,
    project_description TEXT,
    existing_website TEXT,
    existing_url TEXT,
    
    -- Home Services Specific Fields
    service_type TEXT,
    address TEXT,
    address_type TEXT,
    preferred_date DATE,
    preferred_time TEXT,
    description TEXT,
    
    -- Budget & Timeline (Web Services)
    budget TEXT,
    timeline TEXT,
    
    -- Additional Information
    additional_info TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'approved',
        'rejected',
        'more_info_requested',
        'converted'
    )),
    
    -- Staff Response
    staff_notes TEXT,
    staff_response TEXT,
    responded_at TIMESTAMPTZ,
    responded_by UUID,
    
    -- Conversion Tracking
    converted_to_job BOOLEAN DEFAULT FALSE,
    converted_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    converted_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_enquiries_enquiry_ref ON enquiries(enquiry_ref);
CREATE INDEX IF NOT EXISTS idx_enquiries_customer_email ON enquiries(customer_email);
CREATE INDEX IF NOT EXISTS idx_enquiries_customer_phone ON enquiries(customer_phone);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_type ON enquiries(enquiry_type);
CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_converted ON enquiries(converted_to_job) WHERE converted_to_job = FALSE;

-- Auto-update updated_at timestamp
CREATE TRIGGER update_enquiries_updated_at
    BEFORE UPDATE ON enquiries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all enquiries"
    ON enquiries FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can insert enquiries"
    ON enquiries FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Staff can update enquiries"
    ON enquiries FOR UPDATE
    TO authenticated
    USING (true);

-- Allow service role to manage enquiries (for API submissions)
CREATE POLICY "Service role can manage enquiries"
    ON enquiries FOR ALL
    TO service_role
    USING (true);

GRANT ALL ON enquiries TO authenticated;
GRANT ALL ON enquiries TO service_role;

-- Function to generate enquiry reference (trigger function)
CREATE OR REPLACE FUNCTION generate_enquiry_ref()
RETURNS TRIGGER AS $$
DECLARE
    ref TEXT;
    prefix TEXT;
BEGIN
    -- Get the current date in YYMM format
    prefix := TO_CHAR(NOW(), 'YYMM');
    
    -- Generate a unique reference
    LOOP
        ref := 'ENQ' || prefix || LPAD((FLOOR(RANDOM() * 9000) + 1000)::TEXT, 4, '0');
        
        -- Check if this reference already exists
        IF NOT EXISTS (SELECT 1 FROM enquiries WHERE enquiry_ref = ref) THEN
            NEW.enquiry_ref := ref;
            RETURN NEW;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate enquiry reference
CREATE TRIGGER set_enquiry_ref
    BEFORE INSERT ON enquiries
    FOR EACH ROW
    WHEN (NEW.enquiry_ref IS NULL)
    EXECUTE FUNCTION generate_enquiry_ref();

-- Comment on table
COMMENT ON TABLE enquiries IS 'Stores quote requests from web services and home services forms for staff review';
