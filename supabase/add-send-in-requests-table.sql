-- Send-in requests table for UK-wide courier collection repair service
-- Stores form submissions from the send-us-your-device page

CREATE TABLE IF NOT EXISTS send_in_requests (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Request Reference (auto-generated)
    request_ref VARCHAR(20) NOT NULL UNIQUE,

    -- Customer Details
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT NOT NULL,

    -- Collection Address
    collection_address TEXT NOT NULL,

    -- Device Details
    device_type TEXT NOT NULL,
    device_model TEXT,
    issue_description TEXT NOT NULL,

    -- Payment Status
    diagnostic_fee_paid BOOLEAN DEFAULT FALSE,
    diagnostic_fee_amount NUMERIC(10,2) DEFAULT 29.00,
    payment_reference TEXT,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'payment_received',
        'collection_arranged',
        'device_received',
        'diagnosing',
        'quote_sent',
        'repair_approved',
        'repair_declined',
        'repaired',
        'returned',
        'cancelled'
    )),

    -- Staff Notes
    staff_notes TEXT,

    -- Conversion Tracking
    converted_to_job BOOLEAN DEFAULT FALSE,
    converted_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    converted_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_send_in_requests_ref ON send_in_requests(request_ref);
CREATE INDEX IF NOT EXISTS idx_send_in_requests_email ON send_in_requests(customer_email);
CREATE INDEX IF NOT EXISTS idx_send_in_requests_phone ON send_in_requests(customer_phone);
CREATE INDEX IF NOT EXISTS idx_send_in_requests_status ON send_in_requests(status);
CREATE INDEX IF NOT EXISTS idx_send_in_requests_created ON send_in_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_send_in_requests_paid ON send_in_requests(diagnostic_fee_paid) WHERE diagnostic_fee_paid = FALSE;

-- Auto-update updated_at
CREATE TRIGGER update_send_in_requests_updated_at
    BEFORE UPDATE ON send_in_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE send_in_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all send-in requests"
    ON send_in_requests FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can update send-in requests"
    ON send_in_requests FOR UPDATE
    TO authenticated
    USING (true);

-- Allow service role to manage (for API submissions)
CREATE POLICY "Service role can manage send-in requests"
    ON send_in_requests FOR ALL
    TO service_role
    USING (true);

-- Allow anonymous inserts (public form submission)
CREATE POLICY "Anyone can create send-in requests"
    ON send_in_requests FOR INSERT
    TO anon, authenticated, service_role
    WITH CHECK (true);

GRANT SELECT, UPDATE, DELETE ON send_in_requests TO authenticated;
GRANT ALL ON send_in_requests TO service_role;
GRANT INSERT ON send_in_requests TO anon;

-- Function to generate request reference
CREATE OR REPLACE FUNCTION generate_send_in_ref()
RETURNS TRIGGER AS $$
DECLARE
    ref TEXT;
    prefix TEXT;
BEGIN
    prefix := TO_CHAR(NOW(), 'YYMM');

    LOOP
        ref := 'SIR' || prefix || LPAD((FLOOR(RANDOM() * 9000) + 1000)::TEXT, 4, '0');

        IF NOT EXISTS (SELECT 1 FROM send_in_requests WHERE request_ref = ref) THEN
            NEW.request_ref := ref;
            RETURN NEW;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate request reference
CREATE TRIGGER set_send_in_ref
    BEFORE INSERT ON send_in_requests
    FOR EACH ROW
    WHEN (NEW.request_ref IS NULL)
    EXECUTE FUNCTION generate_send_in_ref();

COMMENT ON TABLE send_in_requests IS 'Stores send-in repair requests from the UK-wide courier collection form';
