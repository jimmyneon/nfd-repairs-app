-- ============================================
-- CHECK TABLE SCHEMAS
-- ============================================
-- This will show us the actual column names in each table

-- 1. CHECK ADMIN_SETTINGS TABLE SCHEMA
-- ============================================
SELECT 
    'ADMIN_SETTINGS TABLE SCHEMA' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'admin_settings'
ORDER BY ordinal_position;

-- 2. CHECK SMS_TEMPLATES TABLE SCHEMA
-- ============================================
SELECT 
    'SMS_TEMPLATES TABLE SCHEMA' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'sms_templates'
ORDER BY ordinal_position;

-- 3. CHECK REVIEW_REQUESTS TABLE SCHEMA
-- ============================================
SELECT 
    'REVIEW_REQUESTS TABLE SCHEMA' as info,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'review_requests'
ORDER BY ordinal_position;

-- 4. CHECK JOBS TABLE SCHEMA (relevant columns)
-- ============================================
SELECT 
    'JOBS TABLE SCHEMA' as info,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'jobs'
    AND column_name IN ('id', 'job_number', 'customer_name', 'customer_phone', 'status', 'completed_at')
ORDER BY ordinal_position;

-- 5. SHOW SAMPLE DATA FROM ADMIN_SETTINGS
-- ============================================
SELECT 
    'ADMIN_SETTINGS SAMPLE DATA' as info,
    *
FROM admin_settings
LIMIT 10;

-- 6. SHOW SAMPLE DATA FROM SMS_TEMPLATES
-- ============================================
SELECT 
    'SMS_TEMPLATES SAMPLE DATA' as info,
    *
FROM sms_templates
LIMIT 5;

-- 7. SHOW SAMPLE DATA FROM REVIEW_REQUESTS
-- ============================================
SELECT 
    'REVIEW_REQUESTS SAMPLE DATA' as info,
    *
FROM review_requests
LIMIT 5;
