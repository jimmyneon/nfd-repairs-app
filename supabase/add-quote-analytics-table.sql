-- Quote Analytics Events Table
-- Tracks customer journey through the quote system for funnel analytics

CREATE TABLE IF NOT EXISTS quote_analytics_events (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Session & Linkage
    session_id TEXT NOT NULL,
    enquiry_ref TEXT,
    
    -- Event
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}'::jsonb,
    
    -- Page Context
    page_url TEXT,
    page_path TEXT,
    referrer TEXT,
    
    -- Traffic Source
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    source_tag TEXT,
    
    -- Client Info
    user_agent TEXT,
    viewport TEXT,
    is_mobile BOOLEAN,
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_qae_session_id ON quote_analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_qae_enquiry_ref ON quote_analytics_events(enquiry_ref) WHERE enquiry_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qae_event_type ON quote_analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_qae_created_at ON quote_analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qae_utm_source ON quote_analytics_events(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qae_source_tag ON quote_analytics_events(source_tag) WHERE source_tag IS NOT NULL;

-- RLS Policies
ALTER TABLE quote_analytics_events ENABLE ROW LEVEL SECURITY;

-- Public can insert (analytics tracking from static site)
CREATE POLICY "Public can insert analytics events"
    ON quote_analytics_events FOR INSERT
    TO anon, authenticated, service_role
    WITH CHECK (true);

-- Staff can view analytics
CREATE POLICY "Staff can view analytics events"
    ON quote_analytics_events FOR SELECT
    TO authenticated, service_role
    USING (true);

-- Staff can manage analytics
CREATE POLICY "Staff can manage analytics events"
    ON quote_analytics_events FOR ALL
    TO authenticated, service_role
    USING (true);

-- Grants
GRANT INSERT ON quote_analytics_events TO anon, authenticated, service_role;
GRANT SELECT ON quote_analytics_events TO authenticated, service_role;
GRANT ALL ON quote_analytics_events TO authenticated, service_role;

COMMENT ON TABLE quote_analytics_events IS 'Tracks customer journey events through the quote system for funnel analytics and drop-off tracking';
COMMENT ON COLUMN quote_analytics_events.session_id IS 'Anonymous browser session UUID, persists in localStorage';
COMMENT ON COLUMN quote_analytics_events.enquiry_ref IS 'Linked enquiry reference once form is submitted';
COMMENT ON COLUMN quote_analytics_events.event_type IS 'Type of event: quote_step_enter, quote_form_submit, quote_action_click, etc.';
COMMENT ON COLUMN quote_analytics_events.event_data IS 'JSON payload with event-specific data (step number, price, repair type, etc.)';
COMMENT ON COLUMN quote_analytics_events.source_tag IS 'Custom source tag from URL parameter (e.g., nfd_sms, nfd_whatsapp, nfd_facebook)';
