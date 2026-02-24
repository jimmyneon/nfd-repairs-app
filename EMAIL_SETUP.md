# Email Notifications Setup

## Overview

The repair app now sends professional HTML email notifications to customers using [Resend](https://resend.com). Emails are sent automatically for job creation and status updates.

---

## 🚀 **Quick Setup**

### 1. Get Resend API Key

1. Sign up at [resend.com](https://resend.com)
2. Verify your domain: `newforestdevicerepairs.co.uk`
3. Get your API key from the dashboard

### 2. Configure Environment

Add to your `.env.local`:

```bash
RESEND_API_KEY=re_your_actual_api_key_here
```

### 3. Update Email "From" Address

In `lib/email.ts`, the from address uses the verified Resend domain:

```typescript
from: 'NFD Repairs <repairs@updates.newforestdevicerepairs.co.uk>'
```

---

## 📧 **Email Types**

### Job Created Email

**Sent when**: New job is created via API or manually  
**Includes**:
- Job reference and device details
- Total price
- Deposit information (if required)
- Tracking link
- Payment link (if deposit needed)

### Status Update Email

**Sent when**: Job status changes  
**Includes**:
- New status with custom message
- Device details
- Job reference
- Tracking link

---

## 🎨 **Email Features**

- **Responsive HTML design** - looks great on all devices
- **Brand colors** - matches NFD Repairs branding (#009B4D green, #FAF5E9 cream)
- **Plain text fallback** - for email clients that don't support HTML
- **Professional layout** - header, content area, footer with contact info
- **Call-to-action buttons** - prominent tracking and payment links

---

## 🔧 **How It Works**

### Automatic Sending

Emails are sent automatically in two scenarios:

1. **Job Creation** (`/api/jobs/create-v3`)
   - Checks if customer has email address
   - Sends job created email with all details
   - Includes deposit link if parts required

2. **Status Updates** (`/app/jobs/[id]`)
   - Sends email when status changes
   - Custom message based on new status
   - Only if customer has email on file

### Manual Testing

You can test email sending via API:

```bash
curl -X POST https://your-app.vercel.app/api/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "your-job-id",
    "type": "JOB_CREATED"
  }'
```

---

## 📝 **Customizing Email Templates**

### Edit Templates

Templates are in `lib/email.ts`:

- `generateJobCreatedEmail()` - Job creation email
- `generateStatusUpdateEmail()` - Status change email

### Status Messages

Customize messages in `/api/email/send/route.ts`:

```typescript
const statusMessages: Record<string, string> = {
  'READY_TO_COLLECT': 'Your custom message here',
  // ... other statuses
}
```

---

## 🎯 **When Emails Are Sent**

| Event | Email Sent | SMS Sent |
|-------|-----------|----------|
| Job created (no parts) | ✅ Yes | ✅ Yes |
| Job created (parts needed) | ✅ Yes | ✅ Yes (with deposit link) |
| Status → AWAITING_DEPOSIT | ✅ Yes | ✅ Yes |
| Status → PARTS_ORDERED | ✅ Yes | ✅ Yes |
| Status → READY_TO_BOOK_IN | ✅ Yes | ✅ Yes |
| Status → IN_REPAIR | ✅ Yes | ✅ Yes |
| Status → READY_TO_COLLECT | ✅ Yes | ✅ Yes |
| Status → COMPLETED | ✅ Yes | ✅ Yes |
| Status → CANCELLED | ✅ Yes | ✅ Yes |

**Note**: Emails are only sent if the customer has an email address on file. SMS is always sent (phone required).

---

## 🔍 **Troubleshooting**

### Email Not Sending

1. **Check API key**: Verify `RESEND_API_KEY` is set correctly
2. **Check domain**: Ensure domain is verified in Resend dashboard
3. **Check logs**: Look for errors in Vercel logs
4. **Check customer email**: Ensure job has `customer_email` field populated

### Email in Spam

1. **Verify domain**: Complete SPF, DKIM, DMARC setup in Resend
2. **Warm up domain**: Start with low volume, gradually increase
3. **Test spam score**: Use mail-tester.com

### Wrong "From" Address

Update in `lib/email.ts`:

```typescript
from: 'Your Name <your-email@your-domain.com>'
```

---

## 📊 **Monitoring**

### Resend Dashboard

- View sent emails
- Check delivery status
- See open/click rates
- Monitor bounce rates

### Job Events

Email sends are logged in the `job_events` table:

```sql
SELECT * FROM job_events 
WHERE message LIKE 'Email sent:%' 
ORDER BY created_at DESC;
```

---

## 💡 **Best Practices**

1. **Always include email when creating jobs** - Provides better customer experience
2. **Test emails before going live** - Send to yourself first
3. **Monitor delivery rates** - Check Resend dashboard regularly
4. **Keep templates updated** - Match your brand and messaging
5. **Don't over-email** - SMS for urgent, email for detailed updates

---

## 🆘 **Support**

- **Resend Docs**: [resend.com/docs](https://resend.com/docs)
- **Email Issues**: Check `/api/email/send/route.ts` logs
- **Template Issues**: Edit `lib/email.ts`

---

## ✅ **Setup Checklist**

- [ ] Resend account created
- [ ] Domain verified in Resend
- [ ] API key added to `.env.local`
- [ ] "From" address updated in `lib/email.ts`
- [ ] Test email sent successfully
- [ ] SPF/DKIM/DMARC configured
- [ ] Monitoring set up in Resend dashboard

---

**Email notifications are now live!** 📧✨
