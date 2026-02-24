-- Create push_subscriptions table if it doesn't exist
-- This table stores browser push notification subscriptions for each user

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage their own subscriptions
CREATE POLICY "Users can manage own subscriptions"
    ON push_subscriptions
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id);

-- Allow service role to manage all subscriptions (for API routes)
CREATE POLICY "Service role can manage all subscriptions"
    ON push_subscriptions
    FOR ALL
    TO service_role
    USING (true);

-- Grant permissions
GRANT ALL ON push_subscriptions TO authenticated;
GRANT ALL ON push_subscriptions TO service_role;

-- Comments
COMMENT ON TABLE push_subscriptions IS 'Stores browser push notification subscriptions for users';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push service endpoint URL';
COMMENT ON COLUMN push_subscriptions.p256dh IS 'Public key for encryption';
COMMENT ON COLUMN push_subscriptions.auth IS 'Authentication secret for encryption';
