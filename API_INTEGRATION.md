# API Integration Guide for AI Responder

## 📡 Job Creation API Endpoint

**URL**: `POST /api/jobs/create-v3`

**Full URL**: `https://your-domain.com/api/jobs/create-v3`

---

## 🔑 Authentication

No authentication required for this endpoint (public API for AI Responder).

---

## 📥 Request Format

### Required Fields
```json
{
  "name": "John Smith",
  "phone": "07123456789",
  "device_make": "Apple",
  "device_model": "iPhone 12 Pro",
  "issue": "Cracked screen",
  "quoted_price": 89.99
}
```

### Optional Fields
```json
{
  "email": "customer@email.com",
  "description": "Additional details about the issue",
  "additional_issues": ["Battery draining fast", "Camera not working"],
  "type": "repair",
  "source": "ai_responder",
  "page": "whatsapp",
  "requires_parts_order": false,
  "conversation_id": "conv_123",
  "customer_id": "cust_456",
  "quote_request_id": "quote_789"
}
```

---

## 📤 Response Format

### Success (200)
```json
{
  "success": true,
  "job_id": "uuid-here",
  "job_ref": "JOB-001",
  "tracking_token": "abc123xyz",
  "tracking_url": "https://your-domain.com/t/abc123xyz",
  "status": "READY_TO_BOOK_IN"
}
```

### Error (400/500)
```json
{
  "error": "Missing required fields: name/customer_name, phone/customer_phone, and price_total are required"
}
```

---

## 💰 Deposit Logic

- **Deposit is ALWAYS £20.00** when parts are required
- If `requires_parts_order: true`, job status will be `AWAITING_DEPOSIT`
- If `requires_parts_order: false`, job status will be `READY_TO_BOOK_IN`
- Customer will automatically receive SMS with deposit payment link

---

## 📱 SMS Integration

### Current Setup
- SMS messages are queued in `sms_logs` table with status `PENDING`
- **MacroDroid webhook** is configured to send SMS
- Webhook URL stored in: `MACRODROID_WEBHOOK_URL` env variable

### SMS Triggers
1. **Deposit Required** - When job created with `requires_parts_order: true`
2. **Status Changes** - When job status is updated by staff
3. **Ready to Collect** - When repair is complete

### SMS Endpoint
**URL**: `POST /api/sms/send`

This endpoint processes pending SMS from the queue and sends via MacroDroid webhook.

---

## 🔗 Environment Variables Required

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://your-domain.com
MACRODROID_WEBHOOK_URL=https://trigger.macrodroid.com/your-webhook-id
NEXT_PUBLIC_DEPOSIT_URL=https://pay.sumup.com/b2c/YOUR-LINK
```

---

## 📊 Database Tables

### Jobs Table
All job data is stored in `jobs` table with fields:
- `id`, `job_ref`, `tracking_token`
- `customer_name`, `customer_phone`, `customer_email`
- `device_make`, `device_model`, `issue`, `description`
- `quoted_price`, `price_total`, `deposit_amount`, `deposit_required`, `deposit_received`
- `status`, `created_at`, `updated_at`
- `conversation_id`, `customer_id`, `quote_request_id` (for AI Responder tracking)

### SMS Logs Table
SMS queue stored in `sms_logs` table:
- `id`, `job_id`, `template_key`, `body_rendered`
- `status` (PENDING, SENT, FAILED)
- `sent_at`, `error_message`

---

## 🧪 Testing the API

### cURL Example
```bash
curl -X POST https://your-domain.com/api/jobs/create-v3 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "phone": "07123456789",
    "device_make": "Apple",
    "device_model": "iPhone 12 Pro",
    "issue": "Cracked screen",
    "quoted_price": 89.99,
    "requires_parts_order": false,
    "source": "ai_responder"
  }'
```

### Expected Response
```json
{
  "success": true,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "job_ref": "JOB-001",
  "tracking_token": "abc123xyz",
  "tracking_url": "https://your-domain.com/t/abc123xyz",
  "status": "READY_TO_BOOK_IN"
}
```

---

## ✅ Integration Checklist

- [ ] Set up environment variables
- [ ] Configure MacroDroid webhook URL
- [ ] Test API endpoint with sample data
- [ ] Verify SMS sending works
- [ ] Test tracking URL generation
- [ ] Confirm deposit flow for parts orders
- [ ] Deploy to production

---

## 🚀 Deployment Notes

1. **Vercel/Netlify**: Set environment variables in dashboard
2. **MacroDroid**: Configure webhook to send SMS to customer phone
3. **Supabase**: Ensure RLS policies allow API access
4. **Domain**: Update `NEXT_PUBLIC_APP_URL` to production domain

---

## 📞 Support

For issues with the API integration, check:
1. Supabase logs for database errors
2. Browser console for API response errors
3. `sms_logs` table for SMS sending status
4. `job_events` table for job creation events
