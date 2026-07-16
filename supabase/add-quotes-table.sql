-- Add quotes table to Repair App for syncing from AI Responder
-- This allows fast local search and offline access to quotes

CREATE TABLE IF NOT EXISTS quotes (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Quote Reference from AI Responder (their quote_request_id)
    quote_request_id UUID UNIQUE NOT NULL,
    
    -- Customer Details
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    
    -- Device Details
    device_type TEXT,
    device_make TEXT NOT NULL,
    device_model TEXT NOT NULL,
    issue TEXT NOT NULL,
    description TEXT,
    
    -- Quote Details
    quoted_price NUMERIC(10,2),
    status TEXT DEFAULT 'pending',
    
    -- Conversion Tracking
    converted_to_job BOOLEAN DEFAULT FALSE,
    converted_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    converted_at TIMESTAMPTZ,
    
    -- Source tracking
    source_page TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- AI Responder conversation link
    conversation_id UUID
);

-- Indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_quotes_customer_phone ON quotes(customer_phone);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_name ON quotes(LOWER(customer_name));
CREATE INDEX IF NOT EXISTS idx_quotes_quote_request_id ON quotes(quote_request_id);
CREATE INDEX IF NOT EXISTS idx_quotes_converted ON quotes(converted_to_job) WHERE converted_to_job = FALSE;
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);

-- Auto-update updated_at timestamp
CREATE TRIGGER update_quotes_updated_at
    BEFORE UPDATE ON quotes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all quotes"
    ON quotes FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Staff can insert quotes"
    ON quotes FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Staff can update quotes"
    ON quotes FOR UPDATE
    TO authenticated
    USING (true);

-- Allow service role to insert (for webhook from AI Responder)
CREATE POLICY "Service role can manage quotes"
    ON quotes FOR ALL
    TO service_role
    USING (true);

GRANT ALL ON quotes TO authenticated;
GRANT ALL ON quotes TO service_role;
