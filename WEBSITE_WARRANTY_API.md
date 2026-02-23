# Warranty Ticket API - Website Integration Guide

## 📋 Overview

This API allows your website to submit warranty claims and support tickets directly into the NFD Repairs system.

---

## 🔑 API Credentials

### Get Your API Key

**Step 1:** Run this SQL in Supabase to get your API key:

```sql
SELECT value FROM admin_settings WHERE key = 'warranty_api_key';
```

**Step 2:** Copy the key and keep it secure. You'll need it for all API requests.

**Note:** You can also view/regenerate the API key in the repair app at **Settings → Admin Settings** (once deployed).

---

## 🌐 API Endpoint

### Create Warranty Ticket

**URL:** `https://nfd-repairs-app.vercel.app/api/warranty-tickets`  
**Method:** `POST`  
**Content-Type:** `application/json`

---

## 🔐 Authentication

Include your API key in the request headers:

```
X-API-KEY: your-warranty-api-key-here
```

---

## 📤 Request Format

### Required Fields

```json
{
  "customer": {
    "name": "string (required)",
    "phone": "string (required)",
    "email": "string (optional)"
  },
  "issue": {
    "description": "string (required)"
  }
}
```

### Full Request Schema

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
    "jobId": "uuid-here-if-known",
    "reference": "NFD-2024-001",
    "deviceModel": "iPhone 14 Pro"
  },
  "issue": {
    "description": "Screen still cracked after repair",
    "category": "warranty"
  },
  "attachments": [
    {
      "url": "https://your-cdn.com/image.jpg",
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

---

## 📥 Response Format

### Success Response (200 OK)

```json
{
  "ticketId": "550e8400-e29b-41d4-a716-446655440000",
  "ticketRef": "WRT-2024-0001",
  "matchedJobId": "uuid-or-null",
  "matchConfidence": "high",
  "status": "NEW"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `ticketId` | UUID | Unique ticket identifier |
| `ticketRef` | String | Human-readable ticket reference (WRT-YYYY-NNNN) |
| `matchedJobId` | UUID or null | Matched repair job ID (if found) |
| `matchConfidence` | String | Match confidence: `high`, `medium`, `low`, or `none` |
| `status` | String | Ticket status (always `NEW` for new tickets) |

---

## 🎯 Job Matching Logic

The API automatically attempts to match warranty tickets to existing repair jobs:

**Priority Order:**
1. **Job ID provided** → High confidence match
2. **Job reference provided** → High confidence match
3. **Phone + recent job** (within 90 days) → Medium/Low confidence match
4. **No match found** → Ticket created anyway with `matchConfidence: "none"`

---

## 🔄 Idempotency

The API prevents duplicate submissions:

- **Automatic:** Uses phone + description + timestamp (rounded to 5 minutes)
- **Manual:** Include `Idempotency-Key` header with a unique value

**Example:**
```
Idempotency-Key: warranty-form-submission-123456
```

If the same request is submitted twice, you'll get the same response with `duplicate: true`.

---

## ❌ Error Responses

### 401 Unauthorized
```json
{
  "error": "Missing X-API-KEY header"
}
```
or
```json
{
  "error": "Invalid API key"
}
```

### 400 Bad Request
```json
{
  "error": "Missing required fields: customer.name, customer.phone, issue.description"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create warranty ticket"
}
```

---

## 📞 Phone Number Format

The API accepts various UK phone number formats:

- `+447410381247` (international)
- `07410381247` (UK format)
- `+44 7410 381247` (with spaces)
- `07410 381 247` (with spaces)

All formats are normalized automatically for matching.

---

## 🖼️ Attachments

### Supported File Types
- Images: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Documents: `application/pdf`

### Requirements
- Upload files to your own CDN/storage first
- Provide public HTTPS URLs in the `attachments` array
- Include `type` and `filename` for each attachment

---

## 💻 Example Implementation

### JavaScript/TypeScript

```typescript
async function submitWarrantyClaim(formData) {
  const response = await fetch('https://nfd-repairs-app.vercel.app/api/warranty-tickets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': 'your-api-key-here'
    },
    body: JSON.stringify({
      source: 'website',
      submittedAt: new Date().toISOString(),
      customer: {
        name: formData.name,
        phone: formData.phone,
        email: formData.email
      },
      repair: {
        reference: formData.jobReference, // Optional
        deviceModel: formData.deviceModel
      },
      issue: {
        description: formData.description,
        category: 'warranty'
      },
      attachments: formData.photos.map(photo => ({
        url: photo.url,
        type: photo.type,
        filename: photo.name
      })),
      metadata: {
        ip: formData.ip,
        userAgent: navigator.userAgent
      }
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error)
  }

  return await response.json()
}
```

### PHP

```php
<?php
function submitWarrantyClaim($formData) {
    $apiKey = 'your-api-key-here';
    $url = 'https://nfd-repairs-app.vercel.app/api/warranty-tickets';
    
    $data = [
        'source' => 'website',
        'submittedAt' => date('c'),
        'customer' => [
            'name' => $formData['name'],
            'phone' => $formData['phone'],
            'email' => $formData['email'] ?? null
        ],
        'issue' => [
            'description' => $formData['description'],
            'category' => 'warranty'
        ]
    ];
    
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-API-KEY: ' . $apiKey
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode !== 200) {
        throw new Exception('API request failed: ' . $response);
    }
    
    return json_decode($response, true);
}
?>
```

---

## 🧪 Testing

### Test with cURL

```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/warranty-tickets \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-api-key-here" \
  -d '{
    "customer": {
      "name": "Test Customer",
      "phone": "+447410381247"
    },
    "issue": {
      "description": "Test warranty claim"
    }
  }'
```

### Expected Response

```json
{
  "ticketId": "...",
  "ticketRef": "WRT-2024-0001",
  "matchedJobId": null,
  "matchConfidence": "none",
  "status": "NEW"
}
```

---

## 📊 What Happens After Submission

1. **Ticket Created** - Stored in database with unique reference
2. **Job Matching** - Automatically attempts to match to existing repair
3. **Staff Notification** - NFD staff notified of new warranty claim
4. **Status Tracking** - Ticket can be viewed/managed in repair app
5. **Customer Updates** - Staff can respond and update ticket status

---

## 🔒 Security Best Practices

1. **Never expose API key** in client-side code
2. **Use server-side** proxy to make API calls
3. **Validate input** before sending to API
4. **Rate limit** your form submissions
5. **Log all requests** for debugging
6. **Rotate API key** if compromised

---

## 📞 Support

If you have issues with the API:

1. Check your API key is correct
2. Verify request format matches schema
3. Check for error messages in response
4. Contact NFD Repairs for API key issues

---

## 🔄 API Versioning

Current version: **v1**

The API endpoint may be versioned in the future. We'll notify you of any breaking changes.

---

## ✅ Integration Checklist

- [ ] Get API key from Supabase or Admin Settings
- [ ] Store API key securely (environment variable)
- [ ] Implement server-side API call (never client-side)
- [ ] Add error handling for all response codes
- [ ] Test with sample data
- [ ] Implement idempotency for form resubmissions
- [ ] Add logging for debugging
- [ ] Handle file uploads to your CDN
- [ ] Display success/error messages to users
- [ ] Test phone number format variations

---

## 📝 Notes

- All timestamps should be in ISO 8601 format
- Phone numbers are normalized automatically
- Duplicate prevention works for 5-minute windows
- Attachments must be hosted externally
- API responses are always JSON
- HTTPS is required for all requests
