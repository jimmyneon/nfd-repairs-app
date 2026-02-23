# Warranty Ticket System & Post-Collection SMS - Setup Guide

## Overview

This system implements:
1. **Automated post-collection SMS** - Sends review request 3 hours after collection (or 10am next day if collected after 4pm)
2. **Warranty ticket system** - Handles warranty claims from website or SMS replies
3. **SMS reply handling** - Customer replies create warranty tickets automatically

---

## 🗄️ Database Setup

### 1. Run Schema Migration

In **Supabase SQL Editor**, run:
```sql
-- File: supabase/warranty-system-schema.sql
```

This creates:
- `warranty_tickets` table
- `warranty_ticket_events` table  
- `admin_settings` table
- Adds post-collection SMS fields to `jobs` table
- Auto-generates ticket references (WRT-2024-0001, etc.)

---

## 🔑 API Keys & Configuration

### 1. Get Warranty API Key

After running the schema, get your API key:

```sql
SELECT value FROM admin_settings WHERE key = 'warranty_api_key';
```

**Save this key** - the website will need it to create warranty tickets.

### 2. Set Google Review Link

Update the Google review link:

```sql
UPDATE admin_settings 
SET value = 'https://g.page/r/YOUR_ACTUAL_GOOGLE_REVIEW_LINK/review'
WHERE key = 'google_review_link';
```

### 3. Add CRON_SECRET to Vercel

In **Vercel** → **Settings** → **Environment Variables**, add:

```
CRON_SECRET=your-random-secret-here
```

Generate a random secret:
```bash
openssl rand -hex 32
```

---

## ⏰ Cron Job Setup

### Option A: Vercel Cron (Recommended)

Create `vercel.json` in project root:

```json
{
  "crons": [
    {
      "path": "/api/jobs/send-collection-sms",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

This runs every 15 minutes to send scheduled post-collection SMS.

### Option B: External Cron Service

Use a service like **cron-job.org** or **EasyCron**:

**URL:** `https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms`  
**Method:** GET  
**Schedule:** Every 15 minutes  
**Header:** `Authorization: Bearer YOUR_CRON_SECRET`

---

## 📱 MacroDroid SMS Reply Setup

### Configure MacroDroid to Forward Replies

In MacroDroid app, create a macro:

**Trigger:** SMS Received  
**Action:** HTTP Request

**URL:** `https://nfd-repairs-app.vercel.app/api/sms/reply`  
**Method:** POST  
**Headers:** `Content-Type: application/json`  
**Body:**
```json
{
  "phone": "{sender}",
  "message": "{sms_body}",
  "timestamp": "{timestamp}",
  "threadId": "{thread_id}"
}
```

This forwards customer SMS replies to create warranty tickets.

---

## 🌐 Website Integration

### Warranty Ticket Creation API

**Endpoint:** `POST https://nfd-repairs-app.vercel.app/api/warranty-tickets`

**Headers:**
```
Content-Type: application/json
X-API-KEY: your-warranty-api-key-here
```

**Request Body:**
```json
{
  "source": "website",
  "submittedAt": "2024-02-23T10:00:00Z",
  "customer": {
    "name": "John Smith",
    "phone": "+447410381247",
    "email": "john@example.com"
  },
  "repair": {
    "jobId": "uuid-here",
    "reference": "NFD-2024-001",
    "deviceModel": "iPhone 14 Pro"
  },
  "issue": {
    "description": "Screen still cracked after repair",
    "category": "warranty"
  },
  "attachments": [
    {
      "url": "https://...",
      "type": "image/jpeg",
      "filename": "photo.jpg"
    }
  ],
  "metadata": {
    "ip": "1.2.3.4",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Response:**
```json
{
  "ticketId": "uuid",
  "ticketRef": "WRT-2024-0001",
  "matchedJobId": "uuid-or-null",
  "matchConfidence": "high|medium|low|none",
  "status": "NEW"
}
```

---

## 🔄 How It Works

### Post-Collection SMS Flow

1. **Job marked as COLLECTED** → `queue-status-sms` endpoint called
2. **SMS scheduled** → 3 hours later (or 10am next day if after 4pm)
3. **Cron job runs** → Every 15 minutes, checks for scheduled SMS
4. **SMS sent** → Review request with warranty info
5. **Customer replies** → MacroDroid forwards to `/api/sms/reply`
6. **Warranty ticket created** → Status set to `NEEDS_ATTENTION`
7. **Staff notified** → Push notification sent

### Warranty Ticket Matching

The system attempts to match warranty tickets to existing jobs:

**Priority:**
1. **jobId** provided → High confidence
2. **Job reference** provided → High confidence  
3. **Phone + recent job** (within 90 days) → Medium/Low confidence
4. **No match** → Ticket created anyway

---

## 🎯 Testing

### Test Post-Collection SMS

1. Create a test job with your phone number
2. Mark status as `COLLECTED`
3. Check `jobs` table - `post_collection_sms_scheduled_at` should be set
4. Manually trigger send:

```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms \
  -H "Content-Type: application/json" \
  -d '{"jobId": "your-job-id", "manual": true}'
```

5. Check your phone for SMS

### Test Warranty Ticket Creation

```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/warranty-tickets \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-api-key" \
  -d '{
    "customer": {
      "name": "Test User",
      "phone": "+447410381247"
    },
    "issue": {
      "description": "Test warranty claim"
    }
  }'
```

### Test SMS Reply Handler

```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/sms/reply \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+447410381247",
    "message": "The screen is still cracked",
    "timestamp": "2024-02-23T10:00:00Z"
  }'
```

---

## 📊 Admin Management

### View Warranty Tickets

```sql
SELECT 
  ticket_ref,
  customer_name,
  status,
  match_confidence,
  issue_description,
  created_at
FROM warranty_tickets
ORDER BY created_at DESC;
```

### View Scheduled SMS

```sql
SELECT 
  job_ref,
  customer_name,
  customer_phone,
  post_collection_sms_scheduled_at,
  post_collection_sms_sent_at,
  post_collection_sms_delivery_status
FROM jobs
WHERE post_collection_sms_scheduled_at IS NOT NULL
ORDER BY post_collection_sms_scheduled_at DESC;
```

### Manually Resend Post-Collection SMS

In the job detail page, there will be a "Resend Post-Collection SMS" button (coming in next update).

Or via API:
```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms \
  -H "Content-Type: application/json" \
  -d '{"jobId": "job-id-here", "manual": true}'
```

---

## 🔒 Security

- API key required for warranty ticket creation
- Cron secret required for scheduled SMS sending
- Service role key used server-side only
- Idempotency keys prevent duplicate tickets
- Phone number validation and normalization

---

## 📝 SMS Template

The exact post-collection SMS template:

```
Hi {firstName}, thanks again for choosing New Forest Device Repairs today.

Your repair is covered by our warranty, so if you notice anything you're unsure about just reply to this message and we'll sort it.

If everything's working well, we'd really appreciate a quick review — it helps other local customers know they can rely on us:

{googleReviewLink}

Thanks again for supporting a local business.
```

---

## ✅ Checklist

- [ ] Run `warranty-system-schema.sql` in Supabase
- [ ] Get warranty API key from `admin_settings`
- [ ] Update Google review link in `admin_settings`
- [ ] Add `CRON_SECRET` to Vercel environment variables
- [ ] Set up Vercel Cron or external cron service
- [ ] Configure MacroDroid to forward SMS replies
- [ ] Share API key with website team
- [ ] Test post-collection SMS flow
- [ ] Test warranty ticket creation
- [ ] Test SMS reply handling

---

## 🚀 Next Steps

After setup:
1. Create admin UI for managing warranty tickets
2. Add staff notification system
3. Create warranty ticket dashboard
4. Add manual SMS resend button to job detail page
5. Implement ticket assignment workflow
