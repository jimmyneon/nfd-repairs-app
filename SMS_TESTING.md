# SMS Testing Guide

## 📱 Testing SMS After Deployment

### Prerequisites
- App deployed to Vercel
- MacroDroid webhook configured
- Environment variables set

---

## 🧪 Test Method 1: Via API (Recommended)

### Step 1: Create a Test Job
```bash
curl -X POST https://your-vercel-url.vercel.app/api/jobs/create-v3 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Customer",
    "phone": "07410381247",
    "device_make": "Apple",
    "device_model": "iPhone 12",
    "issue": "Screen repair",
    "quoted_price": 89.99,
    "requires_parts_order": true,
    "source": "test"
  }'
```

### Step 2: Check Response
You'll get back:
```json
{
  "success": true,
  "job_id": "uuid-here",
  "job_ref": "JOB-001",
  "tracking_token": "abc123",
  "tracking_url": "https://your-url.vercel.app/t/abc123",
  "status": "AWAITING_DEPOSIT"
}
```

### Step 3: Verify SMS Queued
1. Go to Supabase dashboard
2. Open `sms_logs` table
3. Look for entry with `status: 'PENDING'`
4. Note the `id` field

### Step 4: Trigger SMS Send
```bash
curl -X POST https://your-vercel-url.vercel.app/api/sms/send \
  -H "Content-Type: application/json" \
  -d '{
    "sms_log_id": "the-id-from-step-3"
  }'
```

### Step 5: Check Phone
SMS should arrive at **07410381247** with:
- Job reference
- Device details
- Deposit amount (£20)
- Payment link
- Tracking link

---

## 🧪 Test Method 2: Via Repair App UI

### Step 1: Login to App
Navigate to: `https://your-vercel-url.vercel.app/login`

### Step 2: Create Manual Job
1. Go to Jobs page
2. Create new job manually
3. Set customer phone: `07410381247`
4. Enable "Parts Required"
5. Save job

### Step 3: Check SMS Queue
SMS will be automatically queued in `sms_logs` table

### Step 4: Send SMS
From job detail page, trigger SMS send (if UI button exists)
OR use API method above

---

## 🧪 Test Method 3: Direct Database Insert

### Step 1: Insert Test SMS Log
```sql
INSERT INTO sms_logs (job_id, template_key, body_rendered, status)
VALUES (
  'existing-job-id',
  'TEST',
  'Test message to 07410381247 from NFD Repairs',
  'PENDING'
);
```

### Step 2: Get the ID
```sql
SELECT id FROM sms_logs WHERE status = 'PENDING' ORDER BY created_at DESC LIMIT 1;
```

### Step 3: Trigger Send
Use API endpoint from Method 1, Step 4

---

## ✅ Expected SMS Content

### Deposit Required Template
```
Hi {customer_name}!

Your {device_make} {device_model} repair quote is ready: £{price_total}

To proceed, we need a £20 deposit to order parts.

Pay here: {deposit_link}

Track your repair: {tracking_link}

Ref: {job_ref}

- New Forest Device Repairs
```

### Variables Replaced
- `{customer_name}` → "Test Customer"
- `{device_make}` → "Apple"
- `{device_model}` → "iPhone 12"
- `{price_total}` → "89.99"
- `{deposit_link}` → Your SumUp payment link
- `{tracking_link}` → `https://your-url.vercel.app/t/abc123`
- `{job_ref}` → "JOB-001"

---

## 🔍 Troubleshooting

### SMS Not Sending

**Check 1: MacroDroid Webhook**
```bash
# Verify webhook URL is set
echo $MACRODROID_WEBHOOK_URL
```

**Check 2: SMS Log Status**
```sql
SELECT * FROM sms_logs WHERE status = 'FAILED';
```

**Check 3: Error Messages**
```sql
SELECT error_message FROM sms_logs WHERE status = 'FAILED' ORDER BY created_at DESC;
```

**Check 4: MacroDroid Logs**
- Open MacroDroid app
- Check webhook trigger logs
- Verify SMS action executed

---

## 📊 SMS Status Flow

```
PENDING → (API call) → SENT
   ↓
FAILED (if error)
```

### Status Meanings
- **PENDING**: Queued, waiting to be sent
- **SENT**: Successfully sent via MacroDroid
- **FAILED**: Error occurred (check `error_message`)

---

## 🎯 Quick Test Command

After deployment, run this one-liner:
```bash
curl -X POST https://YOUR-VERCEL-URL.vercel.app/api/jobs/create-v3 \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","phone":"07410381247","device_make":"Apple","device_model":"iPhone 12","issue":"Test","quoted_price":89.99,"requires_parts_order":true}'
```

Then check phone **07410381247** for SMS!

---

## 📱 Test Phone Number

**07410381247**

Use this number for all SMS tests.
