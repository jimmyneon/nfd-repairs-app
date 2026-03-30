# Message for AI Responder Team - Quote Sync Integration

Hi team,

We need to get the quote sync integration working so our technicians can search for customer quotes at the counter and convert them to jobs. The webhook endpoint is ready on our side, but quotes aren't appearing in the search.

---

## 🚨 Current Issue

**Quote search is not receiving new quotes from your app.**

When technicians search for quotes in the Repair App, they're not seeing any recent quotes from the AI Responder. This means the webhook integration hasn't been implemented yet.

---

## ✅ What's Already Done (Our Side)

- Webhook endpoint is live: `https://nfd-repairs-app.vercel.app/api/quotes/sync`
- Environment variables configured in Vercel
- Database table ready to receive quotes
- Search functionality working

---

## ❌ What's Needed (Your Side)

You need to implement the webhook integration so quotes are automatically synced to the Repair App when they're created or updated.

### 1. Add Webhook Function

Create this function in your codebase:

```javascript
// utils/syncQuoteToRepairApp.js

export async function syncQuoteToRepairApp(quoteData) {
  try {
    const payload = {
      quote_request_id: quoteData.id,           // Your quote ID (must be unique)
      customer_name: quoteData.name,
      customer_phone: quoteData.phone,          // Must include country code e.g. +447410123456
      customer_email: quoteData.email || null,
      device_type: quoteData.device_type || null,  // e.g. "phone", "tablet", "laptop"
      device_make: quoteData.device_make,       // e.g. "Apple", "Samsung"
      device_model: quoteData.device_model,     // e.g. "iPhone 14 Pro"
      issue: quoteData.issue,                   // e.g. "Screen Replacement"
      description: quoteData.description || null,
      quoted_price: quoteData.quoted_price || null,
      status: quoteData.status || 'pending',
      source_page: quoteData.page || null,
      conversation_id: quoteData.conversation_id || null,
      created_at: quoteData.created_at || new Date().toISOString()
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
      const error = await response.text();
      console.error('❌ Failed to sync quote to Repair App:', error);
      return false;
    }

    const result = await response.json();
    console.log('✅ Quote synced to Repair App:', result);
    return true;

  } catch (error) {
    console.error('❌ Error syncing quote to Repair App:', error);
    return false;
  }
}
```

### 2. Call the Webhook

Add webhook calls in these places:

**A. After creating a new quote:**
```javascript
// In your quote creation handler
const newQuote = await createQuote(quoteData);

// Sync to Repair App
await syncQuoteToRepairApp(newQuote);
```

**B. After updating a quote:**
```javascript
// In your quote update handler
const updatedQuote = await updateQuote(quoteId, updates);

// Sync to Repair App
await syncQuoteToRepairApp(updatedQuote);
```

### 3. Environment Variables

Make sure these are set in your Vercel/deployment environment:

```bash
REPAIR_APP_WEBHOOK_URL=https://nfd-repairs-app.vercel.app/api/quotes/sync
REPAIR_APP_WEBHOOK_SECRET=TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=
```

### 4. Bulk Sync Existing Quotes

Run this script once to sync all existing quotes from the last 90 days:

```javascript
// scripts/bulkSyncQuotes.js

import { syncQuoteToRepairApp } from '../utils/syncQuoteToRepairApp.js';

async function bulkSyncQuotes() {
  try {
    // Fetch quotes from your database (adjust query to match your DB)
    const quotes = await db.query(`
      SELECT * FROM quote_requests 
      WHERE created_at >= NOW() - INTERVAL '90 days'
      ORDER BY created_at DESC
    `);

    console.log(`📦 Starting bulk sync of ${quotes.length} quotes...`);

    let successCount = 0;
    let failCount = 0;

    for (const quote of quotes) {
      const success = await syncQuoteToRepairApp(quote);
      
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Rate limit: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Progress update every 10 quotes
      if ((successCount + failCount) % 10 === 0) {
        console.log(`Progress: ${successCount + failCount}/${quotes.length}`);
      }
    }

    console.log(`✅ Bulk sync complete!`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Failed: ${failCount}`);

  } catch (error) {
    console.error('❌ Bulk sync failed:', error);
  }
}

bulkSyncQuotes();
```

Run it with:
```bash
node scripts/bulkSyncQuotes.js
```

---

## 🧪 Testing

### Test the webhook is working:

```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/quotes/sync \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: TDc4nQug0r09fQN6+kn0Imr8XXFY5J9fMslmGATaqQU=" \
  -d '{
    "quote_request_id": "TEST-'$(date +%s)'",
    "customer_name": "Test Customer",
    "customer_phone": "+447410123456",
    "customer_email": "test@example.com",
    "device_make": "Apple",
    "device_model": "iPhone 14 Pro",
    "issue": "Screen Replacement",
    "quoted_price": 89.99,
    "status": "pending"
  }'
```

**Expected response:**
```json
{"success":true,"quote_id":"...","message":"Quote synced successfully"}
```

### Verify in Repair App:

1. Go to: https://nfd-repairs-app.vercel.app/app/jobs/create
2. Click "Search Quotes" button
3. Search for "Test Customer"
4. The test quote should appear

---

## 📋 Required Fields

**Minimum required fields:**
- `quote_request_id` - Your unique quote ID
- `customer_name` - Customer's full name
- `customer_phone` - Phone with country code (e.g. +447410123456)
- `device_make` - Device manufacturer (e.g. "Apple")
- `device_model` - Device model (e.g. "iPhone 14 Pro")
- `issue` - Main issue/repair needed

**Optional but recommended:**
- `customer_email` - For email notifications
- `device_type` - "phone", "tablet", "laptop", etc.
- `description` - Additional details
- `quoted_price` - Price quoted to customer
- `status` - Quote status
- `created_at` - Original creation timestamp

---

## ⏱️ Timeline

**Estimated effort:** 1-2 hours total
- 30 mins: Add webhook function
- 30 mins: Integrate into quote creation/update
- 30 mins: Create and run bulk sync script
- 30 mins: Testing

**Priority:** High - Technicians need this for counter workflow

---

## ✅ Verification Checklist

After implementation, please verify:

- [ ] Environment variables set in Vercel
- [ ] Webhook function created
- [ ] Webhook called after quote creation
- [ ] Webhook called after quote updates
- [ ] Test curl command returns success
- [ ] Test quote appears in Repair App search
- [ ] Bulk sync script run for existing quotes
- [ ] Real quotes from customers appearing in search

---

## 🆘 Need Help?

If you have questions about:
- Database field mappings
- Where to add the webhook calls
- Testing the integration
- Any errors you encounter

Let me know and I can assist.

---

## 📊 Current Status

**Repair App Side:**
- ✅ Webhook endpoint ready
- ✅ Database configured
- ✅ Search UI working
- ✅ Environment variables set

**AI Responder Side:**
- ⏳ Webhook function needs to be created
- ⏳ Integration into quote handlers needed
- ⏳ Bulk sync script needs to be run
- ⏳ Testing required

---

## Expected Outcome

Once implemented:
1. Customer requests quote via AI Responder
2. Quote automatically syncs to Repair App
3. Technician searches for customer at counter
4. Quote appears instantly in search results
5. Technician converts quote to job with one click
6. Seamless workflow! 🎉

---

Thanks for implementing this! It will make a huge difference to our counter workflow.

Let me know once it's done and I'll verify everything is working correctly.
