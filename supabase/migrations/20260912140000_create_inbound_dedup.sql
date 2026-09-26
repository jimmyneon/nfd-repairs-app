-- Inbound SMS deduplication table
-- Prevents the same customer reply from being processed twice when
-- both MacroDroid and the relay are active (dual-running period).
CREATE TABLE IF NOT EXISTS inbound_dedup (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Unique constraint: one record per (phone, body_hash) within a time window
-- We use a partial index to only enforce uniqueness for recent entries
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_dedup_recent
ON inbound_dedup (phone, body_hash)
WHERE created_at > now() - interval '10 minutes';

-- Auto-cleanup: old entries are not needed
CREATE INDEX IF NOT EXISTS idx_inbound_dedup_created_at
ON inbound_dedup (created_at DESC);

ALTER TABLE inbound_dedup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role can manage inbound dedup" ON inbound_dedup
    FOR ALL USING (auth.role() = 'service_role');
