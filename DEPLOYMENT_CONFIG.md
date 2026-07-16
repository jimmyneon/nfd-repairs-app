# Deployment Configuration for Vercel

## Environment Variables to Add

### Production URL
```
https://nfd-repairs-app.vercel.app
```

---

## Required Environment Variable

Add this to your Vercel project settings:

### Variable Name:
```
AI_RESPONDER_WEBHOOK_SECRET
```

### Variable Value:
```
TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=
```

---

## How to Add in Vercel

1. Go to: https://vercel.com/your-team/nfd-repairs-app/settings/environment-variables
2. Click **"Add New"**
3. Enter:
   - **Name**: `AI_RESPONDER_WEBHOOK_SECRET`
   - **Value**: `TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=`
   - **Environment**: Select all (Production, Preview, Development)
4. Click **"Save"**
5. **Redeploy** the application for changes to take effect

---

## For AI Responder Team

Share these details with the AI Responder development team:

### Webhook Configuration

**Endpoint URL:**
```
https://nfd-repairs-app.vercel.app/api/quotes/sync
```

**Method:**
```
POST
```

**Required Header:**
```
x-webhook-secret: TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=
```

**Environment Variables for AI Responder:**
```bash
REPAIR_APP_WEBHOOK_URL=https://nfd-repairs-app.vercel.app/api/quotes/sync
REPAIR_APP_WEBHOOK_SECRET=TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=
```

---

## Testing After Deployment

### 1. Test Webhook Endpoint

```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/quotes/sync \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=" \
  -d '{
    "quote_request_id": "test-123",
    "customer_name": "Test Customer",
    "customer_phone": "+447410123456",
    "customer_email": "test@example.com",
    "device_make": "Apple",
    "device_model": "iPhone 14 Pro",
    "issue": "Screen Replacement",
    "quoted_price": 89.99
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Quote synced successfully",
  "quote_id": "test-123"
}
```

### 2. Verify in Database

Check Supabase:
```sql
SELECT * FROM quotes WHERE quote_request_id = 'test-123';
```

### 3. Test Quote Search

1. Go to: https://nfd-repairs-app.vercel.app/app/jobs/create
2. Click "Search Quotes"
3. Search for: `+447410123456` or `Test Customer`
4. Should see the test quote

---

## Security Notes

⚠️ **Important:**
- The webhook secret is a shared secret between AI Responder and Repair App
- Keep it secure - don't commit to public repositories
- Both apps must use the **exact same secret**
- If compromised, generate a new secret and update both apps

---

## Troubleshooting

### If webhook fails with 401 Unauthorized:
- Check secret matches exactly in both apps
- Verify header name is `x-webhook-secret` (lowercase, with hyphen)

### If webhook fails with 400 Bad Request:
- Check required fields are present in payload
- Verify `quote_request_id` is a valid UUID or string
- Ensure phone number is in correct format

### If quotes don't appear in search:
- Check Supabase `quotes` table exists
- Verify webhook received 200 OK response
- Check quote hasn't already been converted (`converted_to_job = false`)

---

## Deployment Checklist

- [ ] Add `AI_RESPONDER_WEBHOOK_SECRET` to Vercel environment variables
- [ ] Redeploy Vercel app
- [ ] Share webhook URL and secret with AI Responder team
- [ ] AI Responder adds environment variables
- [ ] AI Responder implements webhook function
- [ ] Test with curl command above
- [ ] Run bulk sync script for existing quotes
- [ ] Test quote search in Repair App
- [ ] Test quote-to-job conversion
- [ ] Verify converted quotes don't appear in search

---

## Next Steps After Deployment

1. **Immediate**: Add environment variable to Vercel
2. **Immediate**: Redeploy application
3. **Share with AI Responder**: Send them `AI_RESPONDER_INTEGRATION_INSTRUCTIONS.md`
4. **AI Responder**: Implement webhook and bulk sync
5. **Test**: Create test quote and verify end-to-end flow
6. **Monitor**: Check webhook logs for any errors
