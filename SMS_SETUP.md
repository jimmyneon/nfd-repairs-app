# SMS Integration Setup - MacroDroid Webhook

## Overview

The repair app sends SMS notifications using the **same MacroDroid webhook system** as the AI responder. This keeps everything centralized and simple.

## How It Works

```
Repair App → MacroDroid Webhook → Your Phone → SMS Sent
```

The app makes a simple HTTP POST request to your MacroDroid webhook, which triggers SMS sending from your phone.

---

## Setup

### 1. Get Your MacroDroid Webhook URL

You already have this from the AI responder setup:
```
https://trigger.macrodroid.com/your-webhook-id
```

### 2. Add to Environment Variables

In `.env.local`:
```
MACRODROID_WEBHOOK_URL=https://trigger.macrodroid.com/your-webhook-id
```

### 3. That's It!

The app is already configured to use this webhook. No additional setup needed.

---

## How SMS Are Sent

### Automatic Triggers

SMS are automatically sent when:

1. **Job Created with Deposit Required**
   - Template: `DEPOSIT_REQUIRED`
   - Sent immediately after job creation

2. **Parts Ordered**
   - Template: `PARTS_ORDERED`
   - Sent when staff clicks "Mark Parts Ordered"

3. **Ready to Book In**
   - Template: `READY_TO_BOOK_IN`
   - Sent when parts arrive or job is ready

4. **Repair Started**
   - Template: `IN_REPAIR`
   - Sent when staff clicks "Start Repair"

5. **Ready to Collect**
   - Template: `READY_TO_COLLECT`
   - Sent when repair is complete

6. **Job Completed**
   - Template: `COMPLETED`
   - Sent when customer collects device

### Manual Sending

Staff can also manually send SMS from the job detail page (future feature).

---

## API Format

### Endpoint
```
POST {MACRODROID_WEBHOOK_URL}/send-sms
```

### Request Body
```json
{
  "phone": "+447410381247",
  "message": "Your iPhone 13 Pro repair is complete and ready for collection!"
}
```

### Response
- **200 OK**: SMS sent successfully
- **4xx/5xx**: Error occurred

---

## SMS Templates

Templates are stored in the database and can be edited via `/app/templates`.

### Available Variables

- `{job_ref}` - Job reference (e.g., NFD-260221-A3F)
- `{device_summary}` - Device description
- `{repair_summary}` - Repair description
- `{price_total}` - Total price
- `{deposit_amount}` - Deposit amount
- `{tracking_link}` - Customer tracking URL
- `{deposit_link}` - Payment link
- `{shop_address}` - Shop location
- `{opening_times}` - Opening hours

### Example Template

```
Hi! Your {device_summary} repair is complete (Ref: {job_ref}). 
Ready to collect from {shop_address}. 
{opening_times}. 
Track: {tracking_link} - NFD Repairs
```

Becomes:

```
Hi! Your iPhone 13 Pro - Cracked Screen repair is complete (Ref: NFD-260221-A3F). 
Ready to collect from Lymington, Hampshire. 
Mon-Fri 9am-5:30pm. 
Track: https://repairs.nfdrepairs.co.uk/t/abc123... - NFD Repairs
```

---

## Testing

### Test SMS Sending

1. Create a test job via API:
```bash
curl -X POST https://your-app.com/api/jobs/create \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Test User",
    "customer_phone": "+447410381247",
    "device_summary": "iPhone 13 Pro - Test",
    "repair_summary": "Test repair",
    "price_total": 50.00,
    "parts_required": true,
    "deposit_amount": 20.00
  }'
```

2. Check your phone - you should receive the deposit SMS

3. Check the database:
```sql
SELECT * FROM sms_logs ORDER BY created_at DESC LIMIT 5;
```

### Manual Test

Send a test SMS directly:
```bash
curl -X POST https://trigger.macrodroid.com/your-webhook-id/send-sms \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+447410381247",
    "message": "Test message from repair app"
  }'
```

---

## SMS Logging

All SMS are logged in the `sms_logs` table:

```sql
SELECT 
  sl.created_at,
  sl.status,
  sl.template_key,
  j.job_ref,
  j.customer_phone,
  sl.body_rendered
FROM sms_logs sl
JOIN jobs j ON j.id = sl.job_id
ORDER BY sl.created_at DESC;
```

### Status Values

- `PENDING` - Queued, not yet sent
- `SENT` - Successfully delivered to MacroDroid
- `FAILED` - Error occurred

---

## Troubleshooting

### SMS Not Sending

1. **Check webhook URL**
   ```bash
   echo $MACRODROID_WEBHOOK_URL
   ```
   Should show your webhook URL

2. **Check MacroDroid app**
   - Is the macro enabled?
   - Is your phone connected to internet?
   - Check MacroDroid logs

3. **Check SMS logs**
   ```sql
   SELECT * FROM sms_logs WHERE status = 'FAILED';
   ```

4. **Test webhook directly**
   ```bash
   curl -X POST https://trigger.macrodroid.com/your-webhook-id/send-sms \
     -H "Content-Type: application/json" \
     -d '{"phone": "+447410381247", "message": "Test"}'
   ```

### Phone Number Format

Ensure phone numbers are in international format:
- ✅ `+447410381247`
- ✅ `+44 7410 381247`
- ❌ `07410381247` (missing country code)

The app stores numbers as entered, so ensure they're formatted correctly when creating jobs.

---

## Cost

**FREE** - Using MacroDroid webhook costs nothing. SMS are sent from your phone's regular plan.

---

## Advantages of MacroDroid

✅ **No API fees** - Completely free  
✅ **Reliable** - Uses your phone's SMS  
✅ **Simple** - Just a webhook call  
✅ **Already set up** - Same system as AI responder  
✅ **No rate limits** - Send as many as you need  

---

## Alternative: Shared API Endpoint

If you want to centralize SMS sending, you could create a shared endpoint in the AI responder project that both apps use:

**AI Responder Project:**
```
POST /api/send-sms
Body: { "phone": "...", "message": "..." }
```

**Repair App:**
```typescript
await fetch('https://ai-responder.com/api/send-sms', {
  method: 'POST',
  body: JSON.stringify({ phone, message })
})
```

**Benefits:**
- Single point of configuration
- Easier to switch providers later
- Centralized logging

Let me know if you want this approach instead!

---

## Production Checklist

- [ ] MacroDroid webhook URL configured
- [ ] Environment variable set in Vercel
- [ ] MacroDroid macro enabled on phone
- [ ] Phone has good signal/internet
- [ ] Test SMS sent successfully
- [ ] SMS templates reviewed and customized
- [ ] Phone number format validated
- [ ] SMS logs monitored

---

## Support

If SMS aren't sending:
1. Check MacroDroid app logs
2. Verify webhook URL is correct
3. Test webhook directly with curl
4. Check phone has signal
5. Review `sms_logs` table for errors
