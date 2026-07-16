# Post-Collection Email System

## Overview

The post-collection notification system now sends **both SMS and Email** to customers after they collect their repaired device. The email includes dynamic cross-sell content based on the type of device they had repaired.

## Features

### 1. **Dual Notification System**
- **SMS**: Short, simple message with review link
- **Email**: Detailed message with cross-sell content and review request

### 2. **Dynamic Cross-Sell Content**
The email automatically includes relevant cross-sell suggestions based on device type:

| Device Type | Cross-Sell Services |
|-------------|-------------------|
| **Mobile Phones** (iPhone, Samsung, etc.) | Laptop repairs, Tablet repairs, Console repairs |
| **Tablets** (iPad, Android tablets) | Mobile phone repairs, Laptop repairs, Console repairs |
| **Laptops** (MacBook, Dell, HP, etc.) | Mobile phone repairs, Tablet repairs, Console repairs |
| **Gaming Consoles** (PlayStation, Xbox, Switch) | Mobile phone repairs, Laptop repairs, Tablet repairs |

Each cross-sell section includes:
- Relevant icon
- Service title
- Brief description of what's covered

### 3. **Email Template Structure**

The email includes:
1. **Greeting** - Personalized with customer's first name
2. **Support Section** - "If you have any problems, reply to this email"
3. **Review Request** - Prominent CTA for Google review
4. **Cross-Sell Section** - 3 relevant services based on device type
5. **Contact CTA** - Link to get in touch for other repairs
6. **Footer** - Job reference, device details, contact info

### 4. **Consistent Branding**
- Matches existing email templates (`@/Users/johnhopwood/nfdrepairs/repair-app/lib/email-templates-embedded.ts`)
- Uses New Forest Device Repairs brand colors
- Professional, clean design
- Mobile-responsive HTML

## Files Created/Modified

### New Files
1. **`lib/email-post-collection.ts`**
   - `generatePostCollectionEmail()` - Main email generation function
   - `getCrossSellContent()` - Dynamic cross-sell logic based on device type
   - Returns subject, HTML, and plain text versions

2. **`supabase/add-post-collection-email-fields.sql`**
   - Adds email tracking columns to `jobs` table:
     - `post_collection_email_scheduled_at`
     - `post_collection_email_sent_at`
     - `post_collection_email_delivery_status`
     - `post_collection_email_subject`
     - `post_collection_email_body`

3. **`docs/POST_COLLECTION_EMAIL_SYSTEM.md`** (this file)

### Modified Files
1. **`app/api/jobs/send-collection-sms/route.ts`**
   - Now sends both SMS and email
   - Tracks delivery status for both
   - Logs separate events for SMS and email

2. **`app/api/jobs/schedule-collection-sms/route.ts`**
   - Schedules both SMS and email at same time
   - Updates log messages to mention both notifications

## Database Schema

### New Columns in `jobs` Table

```sql
post_collection_email_scheduled_at TIMESTAMPTZ
post_collection_email_sent_at TIMESTAMPTZ
post_collection_email_delivery_status VARCHAR(50)
post_collection_email_subject TEXT
post_collection_email_body TEXT
```

## How It Works

### 1. Scheduling (When Job Marked as COLLECTED)
```
Job status → COLLECTED
    ↓
schedule-collection-sms API called
    ↓
Calculates scheduled time (1-3 hours or next day 10am-12pm)
    ↓
Applies time guardrails (8am-8pm only)
    ↓
Sets both:
  - post_collection_sms_scheduled_at
  - post_collection_email_scheduled_at
```

### 2. Sending (Via Cron Job)
```
Cron runs every 15 minutes
    ↓
Checks if within allowed hours (8am-8pm)
    ↓
Fetches jobs with scheduled notifications
    ↓
Deduplicates by phone number
    ↓
For each job:
  1. Send SMS (MacroDroid webhook)
  2. Send Email (Resend API)
  3. Update database with delivery status
  4. Log events
  5. Wait 30 seconds before next
```

### 3. Email Content Generation
```
Job data + Google review link
    ↓
Determine device type (phone/tablet/laptop/console)
    ↓
Select 3 relevant cross-sell services
    ↓
Generate HTML email with:
  - Personalized greeting
  - Support message
  - Review request CTA
  - Cross-sell cards
  - Contact CTA
  - Footer with job details
```

## Cross-Sell Logic Examples

### Example 1: Customer had iPhone repaired
**Email includes:**
- 💻 Laptop Repairs
- 📱 Tablet Repairs  
- 🎮 Console Repairs

### Example 2: Customer had MacBook repaired
**Email includes:**
- 📱 Mobile Phone Repairs
- 📱 Tablet Repairs
- 🎮 Console Repairs

### Example 3: Customer had PlayStation repaired
**Email includes:**
- 📱 Mobile Phone Repairs
- 💻 Laptop Repairs
- 📱 Tablet Repairs

## Testing

### Test Email Generation
```typescript
import { generatePostCollectionEmail } from '@/lib/email-post-collection'

const emailTemplate = generatePostCollectionEmail({
  job: {
    customer_name: 'John Smith',
    job_ref: 'NFD-12345',
    device_make: 'Apple',
    device_model: 'iPhone 13',
    // ... other job fields
  },
  googleReviewLink: 'https://g.page/r/YOUR_LINK/review'
})

console.log(emailTemplate.subject)
console.log(emailTemplate.html)
console.log(emailTemplate.text)
```

### SQL Queries for Monitoring

#### Check Scheduled Emails
```sql
SELECT 
    job_ref,
    customer_name,
    customer_email,
    post_collection_email_scheduled_at,
    post_collection_email_sent_at,
    post_collection_email_delivery_status
FROM jobs
WHERE post_collection_email_scheduled_at IS NOT NULL
ORDER BY post_collection_email_scheduled_at DESC
LIMIT 20;
```

#### Check Recent Sent Emails
```sql
SELECT 
    job_ref,
    customer_name,
    customer_email,
    post_collection_email_sent_at,
    post_collection_email_delivery_status,
    LEFT(post_collection_email_subject, 50) as subject_preview
FROM jobs
WHERE post_collection_email_sent_at > NOW() - INTERVAL '24 hours'
ORDER BY post_collection_email_sent_at DESC;
```

#### Email Success Rate
```sql
SELECT 
    COUNT(*) as total_emails,
    COUNT(CASE WHEN post_collection_email_delivery_status = 'SENT' THEN 1 END) as successful,
    COUNT(CASE WHEN post_collection_email_delivery_status = 'FAILED' THEN 1 END) as failed,
    COUNT(CASE WHEN post_collection_email_delivery_status = 'SKIPPED' THEN 1 END) as skipped,
    ROUND(100.0 * COUNT(CASE WHEN post_collection_email_delivery_status = 'SENT' THEN 1 END) / 
          NULLIF(COUNT(*), 0), 2) as success_rate
FROM jobs
WHERE post_collection_email_sent_at IS NOT NULL;
```

## Deployment Steps

1. **Run SQL migration**
   ```sql
   -- Run: supabase/add-post-collection-email-fields.sql
   ```

2. **Deploy code changes**
   - New email template file
   - Updated API routes
   - All changes are backward compatible

3. **Verify Resend API key**
   - Ensure `RESEND_API_KEY` is set in environment variables
   - Email domain verified in Resend dashboard

4. **Monitor**
   - Check cron job logs
   - Verify emails are being sent
   - Check delivery status in database

## Benefits

✅ **Better Customer Experience** - More detailed communication via email  
✅ **Cross-Sell Opportunities** - Relevant service suggestions increase repeat business  
✅ **Professional Branding** - Consistent, polished email design  
✅ **Dual Channel** - SMS for immediate notification, email for detailed info  
✅ **Tracking** - Full visibility into email delivery status  
✅ **Dynamic Content** - Personalized based on device type  

## Notes

- Email only sent if `customer_email` exists in job record
- If no email address, status set to `SKIPPED`
- Email uses same scheduling as SMS (same time)
- Both SMS and email respect 8am-8pm time guardrails
- Cross-sell content automatically adapts to device type
- Email template matches existing brand style
