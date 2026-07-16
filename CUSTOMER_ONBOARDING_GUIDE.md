# Customer Onboarding System

## Overview

The customer onboarding system ensures all necessary information is collected from customers before their repair job can progress. When jobs are created via the API (from the AI Responder), they may be missing critical information like email, device password, or terms acceptance.

---

## 🎯 How It Works

### Onboarding Flow

1. **Job Created via API** → May be missing email, password, or terms
2. **System Checks** → Determines if onboarding is needed
3. **SMS Sent** → Customer receives onboarding link via SMS
4. **Customer Completes** → Provides missing information
5. **Job Unlocked** → Staff can now progress the job

### What Information is Collected

- ✅ **Email Address** (if not provided initially)
- ✅ **Device Password/Passcode** (required for testing)
- ✅ **Terms & Conditions Acceptance**
- ✅ **Digital Signature**

---

## 🗄️ Database Setup

### Run the Migration

Execute in Supabase SQL Editor:

```sql
-- File: supabase/customer-onboarding-schema.sql
```

This adds the following columns to the `jobs` table:

| Column | Type | Purpose |
|--------|------|---------|
| `device_password` | TEXT | Device password/passcode |
| `password_not_applicable` | BOOLEAN | True if device has no password |
| `customer_signature` | TEXT | Base64 encoded signature image |
| `terms_accepted` | BOOLEAN | Whether terms were accepted |
| `terms_accepted_at` | TIMESTAMPTZ | When terms were accepted |
| `onboarding_completed` | BOOLEAN | Whether onboarding is complete |
| `onboarding_completed_at` | TIMESTAMPTZ | When onboarding was completed |
| `onboarding_token` | VARCHAR(64) | Secure token for onboarding access |

---

## 📱 Customer Experience

### Onboarding Page

**URL Format**: `https://your-app.com/onboard/{token}`

**Features**:
- Clean, mobile-friendly interface
- Job summary displayed
- Email input (if missing)
- Device password input with "No Password" checkbox
- Expandable Terms & Conditions modal
- Touch-enabled signature pad
- Real-time validation

### Terms & Conditions

**Includes**:
- Device ownership confirmation
- Data backup responsibility
- Privacy and data handling
- Repair process details
- Payment terms
- Warranty information
- Collection policy
- Liability limits
- Cancellation policy
- Contact information

**Features**:
- Full-screen modal
- Scrollable content
- Professional formatting
- Close button
- Must be accepted to proceed

### Signature Capture

**Features**:
- HTML5 Canvas-based
- Touch and mouse support
- Clear signature button
- Saved as base64 image
- Required for submission

---

## 🔒 Security

### Secure Token System

- **64-character hex token** generated automatically
- **Unique per job** - cannot be reused
- **One-time use** - disabled after completion
- **No authentication required** - token is the auth
- **RLS policies** protect data access

### Data Protection

- Passwords stored securely in database
- Signatures stored as base64 images
- Tokens invalidated after use
- Public access limited to onboarding page only

---

## 🚀 API Integration

### Job Creation Logic

```typescript
// Check if onboarding is needed
const needsOnboarding = !jobData.customer_email || 
                       (!job.device_password && !job.password_not_applicable) ||
                       !job.terms_accepted

// Send appropriate SMS
const templateKey = needsOnboarding 
  ? 'ONBOARDING_REQUIRED'  // Send onboarding link
  : 'DEPOSIT_REQUIRED'      // Send normal status SMS
```

### SMS Template

**Key**: `ONBOARDING_REQUIRED`

**Body**:
```
Hi {customer_name}, we need a few more details to start your {device_make} {device_model} repair. Please complete your details here: {onboarding_link} - Job ref: {job_ref} - NFD Repairs
```

**Variables**:
- `{customer_name}` - Customer's name
- `{device_make}` - Device manufacturer
- `{device_model}` - Device model
- `{onboarding_link}` - Full onboarding URL
- `{job_ref}` - Job reference number

---

## 🛡️ Status Gate

### How It Works

Jobs with incomplete onboarding are **locked**:

- ❌ Status cannot be changed
- ❌ Job cannot progress
- ⚠️ Warning displayed to staff
- ✅ Customer contact still available

### Staff View

**Onboarding Gate Display**:
```
🔒 Customer Onboarding Required

This job cannot progress until the customer completes the onboarding process.
They need to provide:
• Email address (if not provided)
• Device password/passcode  
• Signature and terms acceptance

An SMS with the onboarding link has been sent to the customer.
```

**Status Update Section**:
```
⚠️ Status changes disabled until customer completes onboarding
[All status buttons are disabled]
```

---

## 📊 Onboarding States

### Incomplete Onboarding

**Conditions**:
- `onboarding_completed = false`
- Missing email OR password info OR terms

**Staff Actions**:
- ✅ View job details
- ✅ Contact customer
- ❌ Change status
- ❌ Progress job

**Customer Actions**:
- ✅ Access onboarding page via link
- ✅ Complete required information
- ✅ Submit and unlock job

### Complete Onboarding

**Conditions**:
- `onboarding_completed = true`
- All required info provided
- Terms accepted and signed

**Staff Actions**:
- ✅ View job details
- ✅ Contact customer
- ✅ Change status
- ✅ Progress job normally

---

## 🔄 Workflow Example

### Scenario: API Job with Missing Info

1. **AI Responder creates job**
   - Name: John Smith
   - Phone: 07410123456
   - Email: ❌ Missing
   - Device: iPhone 12 Pro
   - Password: ❌ Missing
   - Terms: ❌ Not accepted

2. **System Response**
   - Creates job with `onboarding_completed = false`
   - Generates unique `onboarding_token`
   - Sends SMS: "Hi John, we need a few more details..."

3. **Customer Receives SMS**
   - Clicks onboarding link
   - Sees job summary
   - Fills in email: john@example.com
   - Enters password: 1234
   - Reads and accepts terms
   - Signs with finger/mouse
   - Submits form

4. **System Updates**
   - Sets `customer_email = john@example.com`
   - Sets `device_password = 1234`
   - Sets `customer_signature = base64...`
   - Sets `terms_accepted = true`
   - Sets `onboarding_completed = true`
   - Logs event: "Customer completed onboarding"
   - Redirects to tracking page

5. **Staff Can Now**
   - Change job status
   - Progress repair
   - Access all information

---

## 🧪 Testing

### Test Onboarding Flow

1. **Create test job via API**:
```bash
curl -X POST https://your-app.com/api/jobs/create-v3 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Customer",
    "phone": "07410123456",
    "device_make": "Apple",
    "device_model": "iPhone 12",
    "issue": "Screen repair",
    "price_total": 89.99
  }'
```

2. **Check SMS sent** with onboarding link

3. **Access onboarding page** via link

4. **Complete form**:
   - Add email
   - Add password or check "No Password"
   - Accept terms
   - Sign

5. **Verify in database**:
```sql
SELECT 
  job_ref,
  customer_email,
  device_password,
  password_not_applicable,
  terms_accepted,
  onboarding_completed
FROM jobs
WHERE job_ref = 'NFD-20260223-001';
```

6. **Check staff app** - status buttons should now be enabled

---

## 🎨 Customization

### Terms & Conditions

Edit the terms in:
```
app/onboard/[token]/page.tsx
```

Look for the Terms modal section and update the content.

### Onboarding Fields

To add more required fields:

1. **Add column to database**:
```sql
ALTER TABLE jobs ADD COLUMN new_field TEXT;
```

2. **Update onboarding check**:
```typescript
const needsOnboarding = !jobData.customer_email || 
                       !job.new_field ||  // Add here
                       (!job.device_password && !job.password_not_applicable) ||
                       !job.terms_accepted
```

3. **Add to onboarding form**:
```tsx
<input
  type="text"
  value={formData.newField}
  onChange={(e) => setFormData({ ...formData, newField: e.target.value })}
/>
```

---

## 🔍 Troubleshooting

### Onboarding Link Not Working

1. **Check token exists**:
```sql
SELECT onboarding_token FROM jobs WHERE job_ref = 'NFD-XXX';
```

2. **Verify RLS policies** allow public access

3. **Check URL format**: `/onboard/{token}`

### Status Still Locked

1. **Verify onboarding_completed**:
```sql
SELECT onboarding_completed FROM jobs WHERE id = 'xxx';
```

2. **Check all required fields** are filled

3. **Refresh page** to reload job data

### SMS Not Sending

1. **Check template exists**:
```sql
SELECT * FROM sms_templates WHERE key = 'ONBOARDING_REQUIRED';
```

2. **Verify MacroDroid webhook** configured

3. **Check sms_logs** for errors

---

## 📋 Database Queries

### Find Jobs Needing Onboarding

```sql
SELECT 
  job_ref,
  customer_name,
  customer_email,
  onboarding_completed,
  created_at
FROM jobs
WHERE onboarding_completed = false
ORDER BY created_at DESC;
```

### Check Onboarding Status

```sql
SELECT 
  job_ref,
  customer_email IS NOT NULL as has_email,
  device_password IS NOT NULL OR password_not_applicable as has_password_info,
  terms_accepted,
  onboarding_completed,
  onboarding_completed_at
FROM jobs
WHERE job_ref = 'NFD-20260223-001';
```

### View Signatures

```sql
SELECT 
  job_ref,
  customer_name,
  LENGTH(customer_signature) as signature_size,
  terms_accepted_at
FROM jobs
WHERE customer_signature IS NOT NULL;
```

---

## ✅ Setup Checklist

- [ ] Run migration: `customer-onboarding-schema.sql`
- [ ] Verify new columns exist in jobs table
- [ ] Check SMS template created: `ONBOARDING_REQUIRED`
- [ ] Test onboarding page loads: `/onboard/{token}`
- [ ] Create test job via API without email
- [ ] Verify SMS sent with onboarding link
- [ ] Complete onboarding form
- [ ] Confirm job unlocked in staff app
- [ ] Verify signature saved in database
- [ ] Test status change now works

---

## 🎯 Best Practices

### For Staff

- ✅ Check onboarding status before contacting customer
- ✅ Remind customers to complete onboarding if needed
- ✅ Don't try to bypass the gate - it's there for a reason
- ✅ Verify all info is correct after onboarding

### For Customers

- ✅ Complete onboarding as soon as possible
- ✅ Provide accurate email for updates
- ✅ Include device password for testing
- ✅ Read terms before accepting
- ✅ Sign clearly

---

## 🔐 Privacy & Compliance

### Data Handling

- Passwords stored securely
- Signatures encrypted in transit
- Terms acceptance timestamped
- Audit trail in job_events
- GDPR compliant

### Customer Rights

- Can request data deletion
- Can update information
- Terms clearly presented
- Signature required for consent

---

**Customer onboarding system is ready!** 🎉

All jobs from the API will now ensure complete information before progressing.
