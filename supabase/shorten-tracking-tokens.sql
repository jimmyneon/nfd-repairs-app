-- Shorten tracking tokens from 64 chars to 12 chars for cleaner URLs
-- Old: /t/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
-- New: /t/a1b2c3d4e5f6

-- Update the function to generate shorter tokens (12 characters instead of 64)
CREATE OR REPLACE FUNCTION generate_tracking_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tracking_token IS NULL OR NEW.tracking_token = '' THEN
        -- Generate 6 random bytes = 12 hex characters (instead of 32 bytes = 64 chars)
        NEW.tracking_token := encode(gen_random_bytes(6), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Same for onboarding tokens
CREATE OR REPLACE FUNCTION generate_onboarding_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.onboarding_token IS NULL OR NEW.onboarding_token = '' THEN
        -- Generate 6 random bytes = 12 hex characters
        NEW.onboarding_token := encode(gen_random_bytes(6), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Existing jobs will keep their long tokens
-- New jobs created after running this will have short 12-character tokens
-- This gives 16^12 = 16 trillion possible combinations (more than enough)
