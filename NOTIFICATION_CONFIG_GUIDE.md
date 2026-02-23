# Notification Configuration System

## Overview

The notification configuration system allows you to control which notification types (Email/SMS/Both) are sent for each job status change. This gives you fine-grained control over customer communications.

---

## 🗄️ Database Setup

### 1. Run the Schema Migration

Execute the SQL file in your Supabase SQL Editor:

```bash
supabase/notification-config-schema.sql
```

This creates two new tables:
- `notification_config` - Controls email/SMS per status
- `email_templates` - Stores customizable email templates

### 2. Verify Tables Created

Check that these tables exist in your Supabase dashboard:
- ✅ `notification_config` (8 rows - one per status)
- ✅ `email_templates` (2 rows - JOB_CREATED, STATUS_UPDATE)

---

## 📱 How It Works

### Notification Flow

1. **Job Status Changes** → Triggers notification check
2. **Check Config** → Looks up `notification_config` for that status
3. **Send Based on Settings**:
   - If `send_sms = true` → Queue SMS
   - If `send_email = true` → Send Email
   - If both `false` → No notifications sent
   - If `is_active = false` → Status disabled entirely

### Default Configuration

All statuses are configured to send **both** SMS and Email by default:

| Status | SMS | Email | Active | Description |
|--------|-----|-------|--------|-------------|
| RECEIVED | ✅ | ✅ | ✅ | Job first created |
| AWAITING_DEPOSIT | ✅ | ✅ | ✅ | Deposit required |
| PARTS_ORDERED | ✅ | ✅ | ✅ | Parts ordered |
| READY_TO_BOOK_IN | ✅ | ✅ | ✅ | Ready to book in |
| IN_REPAIR | ✅ | ✅ | ✅ | Repair in progress |
| READY_TO_COLLECT | ✅ | ✅ | ✅ | Ready for pickup |
| COMPLETED | ✅ | ✅ | ✅ | Job completed |
| CANCELLED | ✅ | ❌ | ✅ | Job cancelled (SMS only) |

---

## 🎛️ Managing Notification Settings

### Via Staff App UI

1. Go to **Settings** → **Notification Settings**
2. For each status, toggle:
   - **SMS** - Send text message
   - **Email** - Send email with embedded job details
   - **Active/Disabled** - Enable/disable entire status

### Via Database

```sql
-- Disable email for CANCELLED status
UPDATE notification_config 
SET send_email = false 
WHERE status_key = 'CANCELLED';

-- Enable both for READY_TO_COLLECT
UPDATE notification_config 
SET send_sms = true, send_email = true 
WHERE status_key = 'READY_TO_COLLECT';

-- Disable entire status
UPDATE notification_config 
SET is_active = false 
WHERE status_key = 'IN_REPAIR';
```

---

## 📧 Email Templates with Embedded Job Tracking

### New Email System

Emails now include **embedded job tracking** directly in the email body:

**Features**:
- ✅ Full job details visible without clicking
- ✅ Status badge with color coding
- ✅ Device information
- ✅ Price breakdown
- ✅ Deposit status (if applicable)
- ✅ Created date
- ✅ Deposit payment button (if needed)
- ✅ Tracking link for full page

### Email Types

#### 1. Job Created Email
**Sent when**: New job is created
**Includes**:
- Welcome message
- Embedded job details
- Deposit alert (if parts required)
- Payment button
- Tracking link

#### 2. Status Update Email
**Sent when**: Job status changes
**Includes**:
- Status change notification
- Custom message per status
- Embedded job details
- Current status badge
- Tracking link

### Customizing Email Content

Edit status messages in `/app/api/email/send/route.ts`:

```typescript
const statusMessages: Record<string, string> = {
  'READY_TO_COLLECT': 'Your custom message here',
  // ... other statuses
}
```

---

## 🎨 Email Design

### Brand Colors
- **Primary Green**: #009B4D
- **Background Cream**: #FAF5E9
- **Status Colors**: Dynamic based on status

### Responsive Design
- Mobile-optimized
- Works in all email clients
- Plain text fallback included

### Status Color Coding
- **RECEIVED**: Gray
- **AWAITING_DEPOSIT**: Amber
- **PARTS_ORDERED**: Purple
- **READY_TO_BOOK_IN**: Blue
- **IN_REPAIR**: Red
- **READY_TO_COLLECT**: Green
- **COMPLETED**: Dark Green
- **CANCELLED**: Gray

---

## 🔧 API Integration

### Check Notification Config

The system automatically checks configuration before sending:

**SMS Check** (`/api/jobs/queue-status-sms`):
```typescript
const { data: config } = await supabase
  .from('notification_config')
  .select('send_sms, is_active')
  .eq('status_key', status)
  .single()

if (!config.send_sms || !config.is_active) {
  // Skip SMS
}
```

**Email Check** (`/api/email/send`):
```typescript
const { data: config } = await supabase
  .from('notification_config')
  .select('send_email, is_active')
  .eq('status_key', job.status)
  .single()

if (!config.send_email || !config.is_active) {
  // Skip email
}
```

---

## 📊 Use Cases

### Example Configurations

#### Minimal Notifications
Only notify on critical statuses:
- AWAITING_DEPOSIT: SMS + Email ✅
- READY_TO_COLLECT: SMS + Email ✅
- All others: Disabled ❌

#### Email-Heavy
Use email for details, SMS for urgent:
- All statuses: Email ✅
- READY_TO_COLLECT: SMS + Email ✅
- Others: Email only ✅

#### SMS-Only
Quick updates via text:
- All statuses: SMS ✅
- Email: Disabled ❌

---

## 🧪 Testing

### Test Notification Settings

1. Create a test job with email address
2. Change status to test
3. Check:
   - SMS sent (if enabled)
   - Email sent (if enabled)
   - Job events logged

### Verify Configuration

```sql
-- Check current settings
SELECT 
  status_label,
  send_sms,
  send_email,
  is_active
FROM notification_config
ORDER BY status_key;
```

---

## 🎯 Best Practices

### When to Use SMS
- ✅ Urgent updates (Ready to Collect)
- ✅ Payment requests (Awaiting Deposit)
- ✅ Quick status changes
- ❌ Detailed information

### When to Use Email
- ✅ Job creation (full details)
- ✅ Status updates with context
- ✅ Deposit information with payment link
- ✅ Embedded job tracking

### When to Use Both
- ✅ Critical status changes
- ✅ Payment required
- ✅ Ready for collection
- ✅ Job completion

### When to Disable
- ❌ Internal statuses
- ❌ Too frequent updates
- ❌ Non-customer-facing changes

---

## 🔍 Troubleshooting

### Notifications Not Sending

1. **Check config table**:
   ```sql
   SELECT * FROM notification_config WHERE status_key = 'YOUR_STATUS';
   ```

2. **Verify is_active = true**
3. **Check send_sms or send_email = true**
4. **Look at job_events for errors**

### Email Not Sending

1. Check customer has email address
2. Verify Resend API key set
3. Check notification_config.send_email = true
4. Look at Vercel logs for errors

### SMS Not Sending

1. Check MacroDroid webhook configured
2. Verify notification_config.send_sms = true
3. Check sms_logs table for status
4. Verify SMS template exists

---

## 📝 Database Schema

### notification_config Table

```sql
CREATE TABLE notification_config (
    id UUID PRIMARY KEY,
    status_key VARCHAR(50) UNIQUE NOT NULL,
    status_label VARCHAR(100) NOT NULL,
    send_sms BOOLEAN DEFAULT true,
    send_email BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### email_templates Table

```sql
CREATE TABLE email_templates (
    id UUID PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🚀 Quick Start

1. **Run migration**: `notification-config-schema.sql`
2. **Access settings**: Settings → Notification Settings
3. **Configure per status**: Toggle SMS/Email as needed
4. **Test**: Create job and change status
5. **Monitor**: Check job_events for sent notifications

---

## ✅ Setup Checklist

- [ ] Migration SQL executed
- [ ] notification_config table has 8 rows
- [ ] email_templates table has 2 rows
- [ ] Notification Settings page accessible
- [ ] Test email sent successfully
- [ ] Test SMS sent successfully
- [ ] Configuration changes working
- [ ] Embedded job details showing in emails

---

**Notification configuration is now live!** 🎉
