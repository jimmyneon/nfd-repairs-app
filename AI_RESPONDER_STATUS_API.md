# AI Responder - Job Status Check API

## Overview
This API allows the AI Responder to check repair job statuses by customer phone number.

---

## 🚀 Quick Integration Summary

**For AI Responder Team:**

**API Endpoint:**
```
GET https://nfd-repairs-app.vercel.app/api/jobs/check-status?phone={phone}
```

**What it does:**
- Takes a phone number (UK format: 07... or +44...)
- Returns all repair jobs for that customer
- Includes current status, device info, pricing, tracking links

**What you get back:**
```json
{
  "success": true,
  "phone": "+447410381247",
  "jobs": [...]  // Array of job objects
}
```

**Important:**
- If `jobs` array is empty, **DO NOT** say "no repairs found"
- Instead, suggest customer may be texting from wrong number
- Offer to escalate or ask for job reference number

**See "Usage in AI Responder" section below for detailed response templates.**

---

## Endpoint

**GET** `/api/jobs/check-status`

**Base URL:** `https://nfd-repairs-app.vercel.app`

---

## Request

### Query Parameters

| Parameter | Type   | Required | Description                                    |
|-----------|--------|----------|------------------------------------------------|
| `phone`   | string | Yes      | Customer phone number (with or without +44)    |

### Example Requests

```bash
# With country code
GET https://nfd-repairs-app.vercel.app/api/jobs/check-status?phone=+447410381247

# Without country code
GET https://nfd-repairs-app.vercel.app/api/jobs/check-status?phone=07410381247
```

---

## Response

### Success Response (200 OK)

```json
{
  "success": true,
  "phone": "+447410381247",
  "jobs": [
    {
      "id": "d83f3e9d-9d59-4484-89e2-e13b9f5697ae",
      "job_ref": "NFD-2024-001",
      "customer_name": "John Smith",
      "customer_phone": "+447410381247",
      "device_make": "Apple",
      "device_model": "iPhone 14 Pro",
      "issue": "Screen replacement",
      "status": "READY_TO_COLLECT",
      "status_label": "Ready to Collect",
      "quoted_price": 149.99,
      "price_total": 149.99,
      "deposit_required": true,
      "deposit_amount": 20.00,
      "deposit_received": true,
      "tracking_token": "abc123...",
      "tracking_url": "https://nfd-repairs-app.vercel.app/t/abc123...",
      "created_at": "2024-02-21T10:30:00Z",
      "updated_at": "2024-02-21T14:45:00Z"
    }
  ]
}
```

### No Jobs Found (200 OK)

```json
{
  "success": true,
  "phone": "+447410381247",
  "jobs": []
}
```

### Error Response (400 Bad Request)

```json
{
  "error": "Phone number is required"
}
```

---

## Job Status Values

| Status              | Label              | Description                                    |
|---------------------|--------------------|------------------------------------------------|
| `RECEIVED`          | Received           | Job received, awaiting assessment              |
| `AWAITING_DEPOSIT`  | Awaiting Deposit   | Waiting for customer to pay deposit            |
| `PARTS_ORDERED`     | Parts Ordered      | Parts have been ordered                        |
| `READY_TO_BOOK_IN`  | Ready to Book In   | Ready for customer to bring device in          |
| `IN_REPAIR`         | In Repair          | Repair work in progress                        |
| `READY_TO_COLLECT`  | Ready to Collect   | Repair complete, ready for pickup              |
| `COMPLETED`         | Completed          | Job finished and collected                     |
| `CANCELLED`         | Cancelled          | Job cancelled                                  |

---

## Usage in AI Responder

### Quick Start for AI Responder

**API Endpoint:** `https://nfd-repairs-app.vercel.app/api/jobs/check-status?phone={phone}`

**When to use:** Customer asks about repair status, wants an update, or inquires about their device.

**Steps:**
1. Extract phone number from conversation context (the number they're texting from)
2. Call API: `GET /api/jobs/check-status?phone={phone}`
3. Check if `jobs` array has items
4. Format response based on results

---

### Example Conversation Flow

**Customer:** "What's the status of my repair?"

**AI Responder:**
1. Extract phone number from conversation context
2. Call API: `GET /api/jobs/check-status?phone={phone}`
3. Parse response and format for customer

---

### Response Templates for AI Responder

#### **Single Job Found:**
```
I can see you have one repair with us:

📱 {device_make} {device_model} - {issue}
Status: {status_label}
Job Ref: {job_ref}

{status_specific_message}

Track your repair: {tracking_url}
```

**Status-Specific Messages:**
- **Ready to Collect:** "Great news! Your device is ready to collect. Opening hours: https://share.google/wCwHX4X6N79tT6b5N"
- **In Repair:** "Our technicians are currently working on your device. We'll update you when it's ready."
- **Awaiting Deposit:** "We need a £{deposit_amount} deposit to order parts. You can pay here: {deposit_link}"
- **Parts Ordered:** "Parts have been ordered and we'll notify you when they arrive."

#### **Multiple Jobs Found:**
```
I can see you have {count} repairs with us:

1. 📱 {device_make} {device_model} - {issue}
   Status: {status_label}
   Job Ref: {job_ref}

2. 💻 {device_make} {device_model} - {issue}
   Status: {status_label}
   Job Ref: {job_ref}

Would you like details about a specific repair?
```

#### **No Jobs Found - IMPORTANT:**

**⚠️ If `jobs` array is empty, this does NOT mean there are no repairs.**

It could mean:
- Customer is texting from a different phone number
- Phone number format doesn't match database
- Job was booked under a different number

**Recommended Response:**
```
I can't seem to find any repair jobs under this phone number.

This could be because:
• You're texting from a different number than the one used for booking
• The repair was booked under a different phone number

Please try:
1. Text from the phone number you used when booking the repair, OR
2. Reply with your job reference number (e.g., NFD-2024-001), OR
3. Let me know and I'll escalate this to our team for assistance

How would you like to proceed?
```

**DO NOT say:** "You don't have any repairs" or "No repairs found"
**DO say:** "I can't seem to find any repair jobs under this phone number"

---

## Phone Number Handling

The API automatically handles different phone number formats:
- `+447410381247` (international format)
- `07410381247` (UK format)
- `+44 7410 381247` (with spaces)

It will try both formats to find matching jobs.

---

## Security

- API uses service role key to bypass RLS
- No authentication required (public endpoint)
- Only returns job information, no sensitive data
- Phone number is the only identifier

---

## Rate Limiting

Consider implementing rate limiting in AI Responder to prevent abuse:
- Max 10 requests per minute per phone number
- Max 100 requests per hour per IP

---

## Testing

```bash
# Test with curl
curl "https://nfd-repairs-app.vercel.app/api/jobs/check-status?phone=+447410381247"

# Test with different format
curl "https://nfd-repairs-app.vercel.app/api/jobs/check-status?phone=07410381247"
```

---

## Integration Checklist

- [ ] Add API endpoint to AI Responder configuration
- [ ] Test phone number extraction from conversation
- [ ] Implement response formatting for single/multiple jobs
- [ ] Add error handling for no jobs found
- [ ] Test with various phone number formats
- [ ] Add rate limiting if needed
