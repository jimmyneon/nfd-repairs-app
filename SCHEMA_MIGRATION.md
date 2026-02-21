# Database Schema Migration Guide

## Overview

The repair app database has been aligned with the AI responder's `quote_requests` table to enable seamless data flow when customers accept quotes.

## What Changed

### Old Schema (v2)
- Simple fields: `device_summary`, `repair_summary`
- Basic customer info: `customer_name`, `customer_phone`
- No device make/model separation
- No additional issues support

### New Schema (v3 - Aligned)
- Detailed device fields: `device_make`, `device_model`, `issue`, `description`
- Enhanced customer info: `customer_name`, `customer_phone`, `customer_email`
- **JSONB support** for `additional_issues` array
- Quote tracking: `quoted_price`, `quoted_at`
- Relationships: `conversation_id`, `customer_id`, `quote_request_id`
- Type field: `repair` or `sell`
- Source tracking: `source`, `page`

## Migration Steps

### 1. Backup Current Database

```sql
-- Export current jobs data
COPY jobs TO '/tmp/jobs_backup.csv' CSV HEADER;
COPY job_events TO '/tmp/job_events_backup.csv' CSV HEADER;
COPY sms_logs TO '/tmp/sms_logs_backup.csv' CSV HEADER;
```

### 2. Run New Schema

1. Go to Supabase SQL Editor
2. Open `/supabase/schema-v3-aligned.sql`
3. Copy entire contents
4. Paste into SQL Editor
5. Click **Run**

⚠️ **Warning**: This will drop existing tables. Make sure you have backups!

### 3. Update Environment Variables

No changes needed - same variables as before.

### 4. Update Code References

The new types are in `/lib/types-v3.ts`. You can:

**Option A: Replace old types**
```bash
mv lib/types.ts lib/types-old.ts
mv lib/types-v3.ts lib/types.ts
```

**Option B: Update imports gradually**
```typescript
// Change from
import { Job } from '@/lib/types'
// To
import { Job } from '@/lib/types-v3'
```

## API Changes

### New Endpoint: `/api/jobs/create-v3`

Accepts **both** old format and new quote_requests format.

### Old Format (Still Works)
```json
{
  "customer_name": "John Smith",
  "customer_phone": "+447410381247",
  "device_summary": "iPhone 12 Pro",
  "repair_summary": "Screen replacement",
  "price_total": 89.99,
  "parts_required": true,
  "deposit_amount": 30.00
}
```

### New Format (From AI Responder)
```json
{
  "name": "John Smith",
  "phone": "+447410381247",
  "email": "john@example.com",
  "device_make": "Apple",
  "device_model": "iPhone 12 Pro",
  "issue": "Cracked screen",
  "description": "Screen shattered after drop, touch still works",
  "additional_issues": [
    {
      "issue": "Battery replacement",
      "description": "Battery health at 78%"
    }
  ],
  "type": "repair",
  "source": "ai_responder",
  "quoted_price": 89.99,
  "requires_parts_order": true,
  "deposit_amount": 30.00,
  "conversation_id": "uuid-here",
  "quote_request_id": "uuid-here"
}
```

## Field Mapping

| Quote Request Field | Jobs Table Field | Notes |
|---------------------|------------------|-------|
| `name` | `customer_name` | Required |
| `phone` | `customer_phone` | Required |
| `email` | `customer_email` | Optional |
| `device_make` | `device_make` | e.g., "Apple" |
| `device_model` | `device_model` | e.g., "iPhone 12 Pro" |
| `issue` | `issue` | Main problem |
| `description` | `description` | Detailed description |
| `additional_issues` | `additional_issues` | JSONB array |
| `type` | `type` | 'repair' or 'sell' |
| `source` | `source` | e.g., 'ai_responder' |
| `page` | `page` | Originating page |
| `quoted_price` | `quoted_price` | Quote amount |
| `quoted_price` | `price_total` | Same value |
| `requires_parts_order` | `requires_parts_order` | Boolean |
| `requires_parts_order` | `parts_required` | Same value |
| `conversation_id` | `conversation_id` | Link to AI chat |
| `customer_id` | `customer_id` | Future use |
| N/A | `quote_request_id` | Link to quote |

## UI Updates Needed

### Job List Page
- Display `device_make` + `device_model` instead of `device_summary`
- Show `issue` instead of `repair_summary`

### Job Detail Page
- Show device make/model separately
- Display main issue prominently
- Show additional issues if present (JSONB array)
- Display customer email if available
- Show quote source and conversation link

### Search
Already updated to search across:
- `customer_name`
- `customer_phone`
- `device_make`
- `device_model`
- `issue`
- `description`

## Testing

### 1. Test Old Format API
```bash
curl -X POST http://localhost:3000/api/jobs/create-v3 \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Test User",
    "customer_phone": "+447410381247",
    "device_summary": "iPhone 12",
    "repair_summary": "Screen repair",
    "price_total": 50.00
  }'
```

### 2. Test New Format API
```bash
curl -X POST http://localhost:3000/api/jobs/create-v3 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "phone": "+447410381247",
    "email": "test@example.com",
    "device_make": "Apple",
    "device_model": "iPhone 12",
    "issue": "Cracked screen",
    "description": "Dropped phone",
    "additional_issues": [{"issue": "Battery", "description": "Low health"}],
    "quoted_price": 50.00,
    "type": "repair",
    "source": "ai_responder"
  }'
```

### 3. Verify Database
```sql
SELECT 
  job_ref,
  customer_name,
  device_make,
  device_model,
  issue,
  additional_issues,
  source
FROM jobs
ORDER BY created_at DESC
LIMIT 5;
```

## Rollback Plan

If you need to rollback:

1. **Restore from backup**
```sql
-- Restore jobs
COPY jobs FROM '/tmp/jobs_backup.csv' CSV HEADER;
```

2. **Run old schema**
```bash
# Use schema-v2.sql instead
```

3. **Revert code changes**
```bash
git checkout lib/types.ts
git checkout app/api/jobs/create/route.ts
```

## Benefits

✅ **Seamless integration** with AI responder
✅ **Richer data** - device make/model, detailed issues
✅ **Multiple repairs** per job via additional_issues
✅ **Better tracking** - conversation_id links to AI chat
✅ **Backwards compatible** - old API format still works
✅ **Future-proof** - ready for customer database integration

## Next Steps

1. ✅ Run new schema in Supabase
2. ⏳ Update UI components to use new fields
3. ⏳ Update AI responder to call new API endpoint
4. ⏳ Test end-to-end flow
5. ⏳ Deploy to production

## Support

If you encounter issues:
1. Check Supabase logs for errors
2. Verify RLS policies are active
3. Ensure all indexes are created
4. Test with both API formats
5. Check that triggers are firing (job_ref, tracking_token)
