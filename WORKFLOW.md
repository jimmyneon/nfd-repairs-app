# Repair Jobs App - Workflow Documentation

## Overview

This is a **mobile-first repair job management system** for New Forest Device Repairs. It handles the complete lifecycle of repair jobs from creation (via API) through completion.

**IMPORTANT**: This app is **separate** from the AI responder system. The AI handles enquiries and quotes. This app only begins once a customer accepts and a job is created.

## Architecture

### Separation of Concerns

```
AI Responder System (Separate)
    ↓ Customer accepts quote
    ↓ POST /api/jobs/create
Repair Jobs App (This System)
    ↓ Job lifecycle management
    ↓ Staff interface
    ↓ Customer tracking
```

## Job Lifecycle

### Status Flow

```
RECEIVED
    ↓
AWAITING_DEPOSIT (if parts required)
    ↓
PARTS_ORDERED
    ↓
READY_TO_BOOK_IN
    ↓
IN_REPAIR
    ↓
READY_TO_COLLECT
    ↓
COMPLETED

(CANCELLED can occur at any point)
```

### Status Descriptions

- **RECEIVED**: Job created, device logged
- **AWAITING_DEPOSIT**: Deposit required for parts (manual payment confirmation)
- **PARTS_ORDERED**: Parts ordered from supplier
- **READY_TO_BOOK_IN**: Ready to start repair (parts arrived or no parts needed)
- **IN_REPAIR**: Active repair work in progress
- **READY_TO_COLLECT**: Repair complete, awaiting customer collection
- **COMPLETED**: Job finished, device collected
- **CANCELLED**: Job cancelled (can happen at any stage)

## User Interfaces

### 1. Staff Interface (Authenticated)

**Login**: `/login`
- Email/password authentication via Supabase Auth
- Protected by middleware

**Job List**: `/app/jobs`
- Mobile-first design with large tap targets
- Real-time updates via Supabase Realtime
- Filter by status
- Search by job ref, device, or customer name
- Notification badge for unread notifications

**Job Detail**: `/app/jobs/[id]`
- Full job information (including customer details)
- Quick action buttons for status changes
- Timeline of all events
- SMS history
- Customer tracking link

### 2. Customer Tracking (Public, No Auth)

**Tracking Page**: `/t/[tracking_token]`
- **GDPR-safe**: Shows NO personal information
- Displays only:
  - Job reference
  - Device summary
  - Repair summary
  - Current status
  - Next step message
  - Shop contact information
- Visual progress tracker
- Mobile-optimized

## API Endpoints

### Job Creation (Called by AI System)

```
POST /api/jobs/create
```

**Request Body**:
```json
{
  "customer_name": "John Smith",
  "customer_phone": "07410381247",
  "device_summary": "iPhone 13 Pro - Cracked Screen",
  "repair_summary": "Screen replacement required",
  "price_total": 89.99,
  "parts_required": true,
  "deposit_amount": 30.00
}
```

**Response**:
```json
{
  "success": true,
  "job_ref": "NFD-260221-A3F",
  "tracking_token": "abc123...",
  "tracking_url": "https://repairs.nfdrepairs.co.uk/t/abc123..."
}
```

**Logic**:
- Generates unique `job_ref` (format: NFD-YYMMDD-XXX)
- Generates secure `tracking_token` (64-char hex)
- Sets initial status:
  - `AWAITING_DEPOSIT` if `parts_required = true`
  - `READY_TO_BOOK_IN` if `parts_required = false`
- Creates `NEW_JOB` notification
- Creates initial job event
- Optionally queues SMS if deposit required

### SMS Sending

```
POST /api/sms/send
```

**Request Body**:
```json
{
  "sms_log_id": "uuid"
}
```

Sends SMS via external API (configured via environment variables).

## Database Schema

### Core Tables

**jobs**
- Stores all repair job data
- Includes customer info (internal only)
- Tracking token for public access

**job_events**
- Audit trail of all changes
- Types: STATUS_CHANGE, NOTE, SYSTEM

**sms_templates**
- Editable SMS templates
- Support variable replacement

**sms_logs**
- History of all SMS sent
- Status tracking (PENDING, SENT, FAILED)

**notifications**
- Staff notifications
- Real-time updates via Supabase

## SMS System

### Templates

Templates stored in database with variables:
- `{job_ref}` - Job reference number
- `{device_summary}` - Device description
- `{price_total}` - Total price
- `{deposit_amount}` - Deposit amount
- `{tracking_link}` - Customer tracking URL
- `{deposit_link}` - Payment link (external)
- `{shop_address}` - Shop location
- `{opening_times}` - Opening hours

### Default Templates

1. **DEPOSIT_REQUIRED**: Sent when job created with parts
2. **PARTS_ORDERED**: Sent when parts ordered
3. **READY_TO_BOOK_IN**: Sent when ready to start
4. **IN_REPAIR**: Sent when repair begins
5. **READY_TO_COLLECT**: Sent when complete
6. **COMPLETED**: Sent after collection

### SMS Integration

Uses **MacroDroid webhook** (same as AI responder):

```
MACRODROID_WEBHOOK_URL=https://trigger.macrodroid.com/your-webhook-id
```

Sends SMS via:
```
POST {MACRODROID_WEBHOOK_URL}/send-sms
Body: { "phone": "+447410381247", "message": "Your message text" }
```

See `SMS_SETUP.md` for complete configuration guide.

## Notifications

Real-time staff notifications using Supabase Realtime:
- New job created
- Status changes
- Action required (e.g., deposit received)

Displayed in:
- Badge counter on jobs list
- Toast notifications (future enhancement)

## Deposit Workflow

1. Job created with `parts_required = true`
2. Status set to `AWAITING_DEPOSIT`
3. SMS sent with payment link (external payment gateway)
4. **Manual confirmation**: Staff presses "Deposit Received" button
5. Status changes to `PARTS_ORDERED`
6. Parts ordering process begins

**Note**: Payment gateway integration is not included. Use external service and confirm manually.

## Privacy & GDPR

### Customer Tracking Page
- **NO personal data exposed**
- No names, phone numbers, or addresses
- Only shows:
  - Job reference (non-personal identifier)
  - Device and repair descriptions
  - Status information
  - Shop contact details

### Staff Interface
- Full access to customer data
- Requires authentication
- Protected by RLS policies

## Mobile-First Design

All interfaces optimized for phone usage:
- Large tap targets (min 44x44px)
- Simple navigation
- Fast loading
- Minimal scrolling
- Clear visual hierarchy

## Environment Variables

Required:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_APP_URL=https://repairs.nfdrepairs.co.uk
```

Optional (for SMS):
```
SMS_API_URL=your-sms-api-url
SMS_API_KEY=your-sms-api-key
NEXT_PUBLIC_DEPOSIT_URL=your-payment-link
```

## Setup Instructions

1. **Database**: Run `supabase/schema-v2.sql` in Supabase SQL Editor
2. **Environment**: Copy `.env.local.example` to `.env.local` and configure
3. **Dependencies**: Run `npm install`
4. **Development**: Run `npm run dev`
5. **Create Staff User**: Use Supabase dashboard to create auth user
6. **Deploy**: Push to Vercel

## Integration with AI System

The AI responder should:
1. Handle customer enquiries
2. Provide quotes
3. Get customer acceptance
4. Call `POST /api/jobs/create` with job details
5. Receive `job_ref` and `tracking_url`
6. Provide tracking URL to customer

## Future Enhancements

- [ ] SMS template editor UI (`/app/templates`)
- [ ] Automated payment gateway integration
- [ ] Photo upload for repairs
- [ ] Customer signature capture
- [ ] Warranty certificate generation
- [ ] Analytics dashboard
- [ ] Email notifications
- [ ] WhatsApp integration

## Support

For issues or questions:
- Check Supabase logs for database errors
- Check browser console for client errors
- Review SMS logs in database for delivery issues
- Verify environment variables are set correctly
