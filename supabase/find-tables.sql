-- Find where the jobs table actually exists
-- Run this first to identify the correct schema

-- 1. List all schemas
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name NOT LIKE 'pg_%' 
AND schema_name NOT LIKE 'information_schema'
ORDER BY schema_name;

-- 2. List all tables in all schemas
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_name = 'jobs'
ORDER BY table_schema;

-- 3. List all tables in public schema
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
