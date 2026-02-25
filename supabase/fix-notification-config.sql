-- Fix notification_config table to include all current statuses
-- and remove deprecated READY_TO_BOOK_IN status

-- 1. Drop the old constraint
ALTER TABLE notification_config 
DROP CONSTRAINT IF EXISTS valid_status_key;

-- 2. Remove deprecated READY_TO_BOOK_IN entry
DELETE FROM notification_config 
WHERE status_key = 'READY_TO_BOOK_IN';

-- 3. Add missing status entries
INSERT INTO notification_config (status_key, status_label, send_sms, send_email, is_active, description) VALUES
('QUOTE_APPROVED', 'Quote Approved', true, true, true, 'Repair quote approved - customer should drop off device'),
('DROPPED_OFF', 'Dropped Off', true, true, true, 'Device dropped off at shop (for API/online jobs)'),
('COLLECTED', 'Collected', true, true, true, 'Customer has collected their repaired device')
ON CONFLICT (status_key) DO UPDATE SET
    status_label = EXCLUDED.status_label,
    description = EXCLUDED.description;

-- 4. Add new constraint with all current statuses
ALTER TABLE notification_config 
ADD CONSTRAINT valid_status_key CHECK (status_key IN (
    'QUOTE_APPROVED',
    'DROPPED_OFF',
    'RECEIVED',
    'AWAITING_DEPOSIT',
    'PARTS_ORDERED',
    'PARTS_ARRIVED',
    'IN_REPAIR',
    'DELAYED',
    'READY_TO_COLLECT',
    'COLLECTED',
    'COMPLETED',
    'CANCELLED'
));

-- 5. Verify all statuses are present
SELECT status_key, status_label, send_sms, send_email, is_active 
FROM notification_config 
ORDER BY 
    CASE status_key
        WHEN 'QUOTE_APPROVED' THEN 1
        WHEN 'DROPPED_OFF' THEN 2
        WHEN 'RECEIVED' THEN 3
        WHEN 'AWAITING_DEPOSIT' THEN 4
        WHEN 'PARTS_ORDERED' THEN 5
        WHEN 'PARTS_ARRIVED' THEN 6
        WHEN 'IN_REPAIR' THEN 7
        WHEN 'DELAYED' THEN 8
        WHEN 'READY_TO_COLLECT' THEN 9
        WHEN 'COLLECTED' THEN 10
        WHEN 'COMPLETED' THEN 11
        WHEN 'CANCELLED' THEN 12
    END;
