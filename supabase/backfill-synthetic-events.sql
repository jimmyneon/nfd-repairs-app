-- Backfill synthetic job_events for existing jobs that have skipped statuses
-- This fixes the timeline display for imported/manual jobs

DO $$
DECLARE
  job_record RECORD;
  synthetic_events JSONB[];
  event_time TIMESTAMPTZ;
  event_count INT;
BEGIN
  -- Loop through all jobs that might need synthetic events
  FOR job_record IN 
    SELECT 
      j.id,
      j.status,
      j.parts_required,
      j.source,
      j.created_at,
      COUNT(je.id) as event_count
    FROM jobs j
    LEFT JOIN job_events je ON je.job_id = j.id AND je.type = 'STATUS_CHANGE'
    WHERE j.status IN ('AWAITING_DEPOSIT', 'PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED')
    GROUP BY j.id, j.status, j.parts_required, j.source, j.created_at
    HAVING COUNT(je.id) < 2  -- Jobs with fewer than 2 status change events likely need backfill
  LOOP
    synthetic_events := ARRAY[]::JSONB[];
    event_time := job_record.created_at;
    event_count := 0;
    
    -- Check if RECEIVED event exists
    IF NOT EXISTS (
      SELECT 1 FROM job_events 
      WHERE job_id = job_record.id 
      AND type = 'STATUS_CHANGE' 
      AND message LIKE '%Received%'
    ) THEN
      -- Add RECEIVED event
      synthetic_events := array_append(
        synthetic_events,
        jsonb_build_object(
          'job_id', job_record.id,
          'type', 'STATUS_CHANGE',
          'message', 'Status changed to Received',
          'created_at', event_time + (event_count || ' minutes')::INTERVAL
        )
      );
      event_count := event_count + 1;
    END IF;
    
    -- If parts required and status is past AWAITING_DEPOSIT
    IF job_record.parts_required 
       AND job_record.status IN ('PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED')
       AND NOT EXISTS (
         SELECT 1 FROM job_events 
         WHERE job_id = job_record.id 
         AND type = 'STATUS_CHANGE' 
         AND message LIKE '%Awaiting Deposit%'
       ) THEN
      synthetic_events := array_append(
        synthetic_events,
        jsonb_build_object(
          'job_id', job_record.id,
          'type', 'STATUS_CHANGE',
          'message', 'Status changed to Awaiting Deposit',
          'created_at', event_time + (event_count || ' minutes')::INTERVAL
        )
      );
      event_count := event_count + 1;
    END IF;
    
    -- If parts required and status is PARTS_ORDERED or beyond
    IF job_record.parts_required 
       AND job_record.status IN ('PARTS_ORDERED', 'PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED')
       AND NOT EXISTS (
         SELECT 1 FROM job_events 
         WHERE job_id = job_record.id 
         AND type = 'STATUS_CHANGE' 
         AND message LIKE '%Parts Ordered%'
       ) THEN
      synthetic_events := array_append(
        synthetic_events,
        jsonb_build_object(
          'job_id', job_record.id,
          'type', 'STATUS_CHANGE',
          'message', 'Status changed to Parts Ordered',
          'created_at', event_time + (event_count || ' minutes')::INTERVAL
        )
      );
      event_count := event_count + 1;
    END IF;
    
    -- If parts required and status is PARTS_ARRIVED or beyond
    IF job_record.parts_required 
       AND job_record.status IN ('PARTS_ARRIVED', 'IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED')
       AND NOT EXISTS (
         SELECT 1 FROM job_events 
         WHERE job_id = job_record.id 
         AND type = 'STATUS_CHANGE' 
         AND message LIKE '%Parts Arrived%'
       ) THEN
      synthetic_events := array_append(
        synthetic_events,
        jsonb_build_object(
          'job_id', job_record.id,
          'type', 'STATUS_CHANGE',
          'message', 'Status changed to Parts Arrived',
          'created_at', event_time + (event_count || ' minutes')::INTERVAL
        )
      );
      event_count := event_count + 1;
    END IF;
    
    -- If status is IN_REPAIR or DELAYED or beyond
    IF job_record.status IN ('IN_REPAIR', 'DELAYED', 'READY_TO_COLLECT', 'COLLECTED', 'COMPLETED')
       AND NOT EXISTS (
         SELECT 1 FROM job_events 
         WHERE job_id = job_record.id 
         AND type = 'STATUS_CHANGE' 
         AND message LIKE '%In Repair%'
       ) THEN
      synthetic_events := array_append(
        synthetic_events,
        jsonb_build_object(
          'job_id', job_record.id,
          'type', 'STATUS_CHANGE',
          'message', 'Status changed to In Repair',
          'created_at', event_time + (event_count || ' minutes')::INTERVAL
        )
      );
      event_count := event_count + 1;
    END IF;
    
    -- Insert synthetic events if any were created
    IF array_length(synthetic_events, 1) > 0 THEN
      INSERT INTO job_events (job_id, type, message, created_at)
      SELECT 
        (event->>'job_id')::UUID,
        event->>'type',
        event->>'message',
        (event->>'created_at')::TIMESTAMPTZ
      FROM unnest(synthetic_events) AS event;
      
      RAISE NOTICE 'Created % synthetic events for job %', array_length(synthetic_events, 1), job_record.id;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Backfill complete';
END $$;
