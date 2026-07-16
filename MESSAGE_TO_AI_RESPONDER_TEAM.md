# Message to AI Responder Team

## Quote Sync Integration - Implementation Required

Hi team,

We need to sync quotes from the AI Responder app to the Repair App so technicians can quickly search and convert quotes to jobs at the counter.

---

## 1. Vercel Environment Variables (Already Done)

The following environment variables have been added to your Vercel project:

```
REPAIR_APP_WEBHOOK_URL=https://nfd-repairs-app.vercel.app/api/quotes/sync
REPAIR_APP_WEBHOOK_SECRET=TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=
```

---

## 2. What You Need to Implement

### A. Create Webhook Function

Add this function to your codebase (adjust field names to match your database):

```javascript
// utils/syncQuoteToRepairApp.js or similar

export async function syncQuoteToRepairApp(quoteData) {
  try {
    const payload = {
      quote_request_id: quoteData.id,           // Your quote ID
      customer_name: quoteData.name,
      customer_phone: quoteData.phone,          // Must include country code e.g. +44
      customer_email: quoteData.email,
      device_type: quoteData.device_type,       // e.g. "phone", "tablet", "laptop"
      device_make: quoteData.device_make,       // e.g. "Apple", "Samsung"
      device_model: quoteData.device_model,     // e.g. "iPhone 14 Pro"
      issue: quoteData.issue,                   // e.g. "Screen Replacement"
      description: quoteData.description,
      quoted_price: quoteData.quoted_price,
      status: quoteData.status,
      source_page: quoteData.page,
      conversation_id: quoteData.conversation_id
    };

    const response = await fetch(process.env.REPAIR_APP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': process.env.REPAIR_APP_WEBHOOK_SECRET
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Failed to sync quote:', await response.text());
    }
  } catch (error) {
    console.error('Error syncing quote to Repair App:', error);
  }
}
```

### B. Call This Function

Add the webhook call in these places:

1. **After creating a new quote** (in your quote creation handler)
2. **After updating a quote** (in your quote update handler)

Example:
```javascript
// In your quote creation/update code
const newQuote = await db.quotes.create({ ... });

// Sync to Repair App
await syncQuoteToRepairApp(newQuote);
```

### C. Bulk Sync Existing Quotes

Run this **one-time script** to sync all existing quotes (last 90 days):

```javascript
// scripts/bulkSyncQuotes.js

async function bulkSyncQuotes() {
  // Fetch quotes from your database
  const quotes = await db.query(`
    SELECT * FROM quote_requests 
    WHERE created_at >= NOW() - INTERVAL '90 days'
    ORDER BY created_at DESC
  `);

  console.log(`Syncing ${quotes.length} quotes...`);

  for (const quote of quotes) {
    await syncQuoteToRepairApp(quote);
    
    // Rate limit: wait 100ms between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('Bulk sync complete!');
}

bulkSyncQuotes();
```

---

## 3. Required Fields

**Minimum required fields** in the webhook payload:
- `quote_request_id` (your quote ID)
- `customer_name`
- `customer_phone` (must include country code, e.g. +447410123456)
- `device_make`
- `device_model`
- `issue`

**Optional but recommended:**
- `customer_email`
- `device_type`
- `description`
- `quoted_price`
- `status`

---

## 4. Testing

### Test the webhook:

```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/quotes/sync \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=" \
  -d '{
    "quote_request_id": "test-123",
    "customer_name": "Test Customer",
    "customer_phone": "+447410123456",
    "device_make": "Apple",
    "device_model": "iPhone 14 Pro",
    "issue": "Screen Replacement",
    "quoted_price": 89.99
  }'
```

Expected response: `{"success": true, "message": "Quote synced successfully"}`

---

## 5. Timeline

**Priority:** Medium-High (needed for counter workflow)

**Estimated effort:** 1-2 hours
- 30 mins: Add webhook function
- 30 mins: Integrate into quote creation/update
- 30 mins: Create and run bulk sync script
- 30 mins: Testing

---

## 6. Questions?

If you need clarification on:
- Database field mappings
- Where to add the webhook calls
- Testing the integration

Let me know and I can help.

---

## Summary

1. ✅ Environment variables already added to Vercel
2. ⏳ Add `syncQuoteToRepairApp()` function to your codebase
3. ⏳ Call it after quote creation/updates
4. ⏳ Run bulk sync script for existing quotes
5. ⏳ Test with curl command above

Once implemented, technicians will be able to search for quotes instantly at the counter and convert them to jobs with one click.

Thanks!
