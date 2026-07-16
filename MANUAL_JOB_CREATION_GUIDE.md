# Manual Job Creation - Implementation Guide

## Overview
This guide documents the updated manual job creation workflow for the repair shop counter. The system now follows a two-stage process: **Technician Screen → Customer Screen**.

---

## Implementation Summary

### 1. Quote Sync System (Option 2 - Local Database)

**Why this approach?**
- Fast local search (no network delays)
- Works offline
- Better UX for busy shop counter

**Components Created:**

#### Database Schema
- **File**: `/supabase/add-quotes-table.sql`
- **Table**: `quotes`
- **Key fields**: 
  - `quote_request_id` (links to AI Responder)
  - Customer details (name, phone, email)
  - Device details (type, make, model, issue)
  - Conversion tracking (`converted_to_job`, `converted_job_id`)

#### API Endpoints
1. **Sync Endpoint**: `/api/quotes/sync/route.ts`
   - Receives quotes from AI Responder via webhook
   - Upserts quotes to local database
   - Requires webhook secret authentication

2. **Search Endpoint**: `/api/quotes/search/route.ts`
   - Searches local quotes database
   - Supports filtering by phone, name, quote ID, or all fields
   - Returns only unconverted quotes

#### UI Component
- **File**: `/components/QuoteLookupModal.tsx`
- **Features**:
  - Search by phone, name, or quote ID
  - Shows all recent quotes if no search term
  - One-click "Convert to Job" button
  - Pre-fills form with quote data

---

### 2. Passcode Security System

**Database Schema:**
- **File**: `/supabase/add-passcode-fields.sql`
- **New fields**:
  - `passcode_requirement`: 'not_required' | 'recommended' | 'required'
  - `passcode_method`: 'provided' | 'will_remove' | 'send_link' | 'not_applicable'
  - `passcode_deletion_scheduled_at`: Auto-delete timestamp
  - `linked_quote_id`: Reference to quote if converted

**Security Features:**
- Passcodes stored securely
- Auto-deletion scheduled 7 days after collection
- Helper text explains security measures to customers

---

### 3. Technician Screen (Stage 1)

**File**: `/app/app/jobs/create/page.tsx`

**Key Changes:**
- ✅ Removed customer detail fields (name, phone, email)
- ✅ Device details shown first
- ✅ Added "Quick Walk-In Mode" button for busy periods
- ✅ Added "Search Quotes" button
- ✅ Added passcode requirement selector (3 options)
- ✅ Added technician notes field (hidden in Quick Walk-In mode)
- ✅ Submit button now says "Switch to Customer Screen"

**Workflow:**
1. Technician selects device type, make, model
2. Selects issue from dropdown
3. Enters fault description (optional)
4. Sets price and parts requirement
5. Selects passcode requirement level
6. Clicks "Switch to Customer Screen"

**Quote Integration:**
- Click "Search Quotes" button
- Search by phone/name/ID
- Select quote → auto-fills device/customer data
- Stores `linked_quote_id` on job

---

### 4. Customer Screen (Stage 2)

**File**: `/components/CustomerConfirmationModal.tsx`

**Key Changes:**
- ✅ Added customer detail input fields (name, phone, email)
- ✅ Email marked as optional with helper text
- ✅ Passcode section now conditional (based on tech's selection)
- ✅ 4 passcode options:
  1. Enter passcode now
  2. I will remove the passcode
  3. Send secure link later
  4. Device has no passcode
- ✅ Simplified terms to bullet points
- ✅ Removed "Cancel" button (customer can't cancel)
- ✅ Button text: "Confirm Booking"

**Workflow:**
1. Customer enters their name (required)
2. Customer enters phone number (required)
3. Customer enters email (optional)
4. If passcode required/recommended: customer selects option
5. Reviews repair summary
6. Acknowledges diagnostic fee policy
7. Accepts repair terms
8. Clicks "Confirm Booking"

---

### 5. Booking Confirmation Screen

**File**: `/components/BookingConfirmationScreen.tsx`

**Features:**
- ✅ Shows success checkmark
- ✅ Displays job reference number
- ✅ Message: "You will receive a text message shortly"
- ✅ "Done" button
- ✅ Auto-closes after 10 seconds
- ✅ Returns to job creation for next customer

---

## AI Responder Integration

### Webhook Setup Required

**In AI Responder App:**
1. Create webhook endpoint that sends quotes to Repair App
2. POST to: `https://your-repair-app.com/api/quotes/sync`
3. Include header: `x-webhook-secret: YOUR_SECRET_KEY`
4. Send on quote creation/update

**Payload Format:**
```json
{
  "quote_request_id": "uuid",
  "customer_name": "John Smith",
  "customer_phone": "+447410123456",
  "customer_email": "john@example.com",
  "device_type": "phone",
  "device_make": "Apple",
  "device_model": "iPhone 14 Pro",
  "issue": "Screen Replacement",
  "description": "Cracked screen",
  "quoted_price": 89.99,
  "status": "pending",
  "source_page": "website",
  "conversation_id": "uuid"
}
```

---

## Environment Variables Required

Add to `.env.local`:
```bash
# AI Responder webhook authentication
AI_RESPONDER_WEBHOOK_SECRET=your-secret-key-here
```

---

## Database Migration Steps

Run these SQL files in order:

1. **Quotes table**: 
   ```bash
   psql -f supabase/add-quotes-table.sql
   ```

2. **Passcode fields**:
   ```bash
   psql -f supabase/add-passcode-fields.sql
   ```

---

## Testing Checklist

### Quote Sync
- [ ] AI Responder sends quote via webhook
- [ ] Quote appears in Repair App search
- [ ] Quote can be converted to job
- [ ] Converted quotes don't appear in search

### Manual Job Creation
- [ ] Quick Walk-In mode works
- [ ] Device details captured correctly
- [ ] Passcode requirement selector works
- [ ] Customer screen shows correct fields
- [ ] Conditional passcode section works
- [ ] Email optional field has helper text
- [ ] Booking confirmation shows job ref
- [ ] Form resets after successful creation

### Passcode Security
- [ ] Passcode stored securely
- [ ] Deletion scheduled correctly
- [ ] Different passcode methods work

---

## Future Enhancements

1. **Passcode Auto-Deletion Cron Job**
   - Create scheduled job to delete passcodes after 7 days
   - Run daily at midnight
   - Check `passcode_deletion_scheduled_at` field

2. **Quote Status Sync**
   - Update quote status when converted to job
   - Webhook back to AI Responder with job reference

3. **Customer Signature Capture**
   - Add signature pad to customer screen
   - Store signature image securely

4. **SMS Passcode Link**
   - Implement secure link generation
   - Send SMS when passcode needed
   - Time-limited access token

---

## API Changes

### `/api/jobs/create-v3/route.ts`

**New fields accepted:**
- `passcode_requirement`
- `passcode_method`
- `linked_quote_id`

**Behavior:**
- Accepts customer data from customer screen
- Stores passcode securely
- Links to quote if converted
- Schedules passcode deletion (7 days after collection)

---

## Key Benefits

1. **Faster booking** - Technician starts job during conversation
2. **Less friction** - Customer only enters their own details
3. **Better UX** - Clear two-stage process
4. **Quote integration** - Easy conversion from quotes
5. **Security** - Passcodes auto-deleted
6. **Flexibility** - Quick Walk-In mode for busy periods
7. **Offline capable** - Local quote database

---

## Support

For issues or questions:
1. Check this guide first
2. Review component files for inline documentation
3. Check API endpoint error responses
4. Verify database schema matches expectations
