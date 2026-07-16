# Email Debugging Guide

## 🔍 **Issue: Emails Not Sending via Resend**

Emails were working before but have stopped sending recently.

---

## 📋 **Checklist to Debug**

### **1. Check Environment Variables**

The `RESEND_API_KEY` must be set in Vercel's environment variables (not local `.env` files for production).

**How to check:**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project: `nfd-repairs-app`
3. Go to **Settings** → **Environment Variables**
4. Look for `RESEND_API_KEY`

**Expected:**
- Key: `RESEND_API_KEY`
- Value: `re_xxxxxxxxxxxxx` (starts with `re_`)
- Environments: ✓ Production, ✓ Preview, ✓ Development

**If missing or incorrect:**
- Add/update the variable
- **Redeploy** the app (environment changes require redeployment)

---

### **2. Check Resend Dashboard**

**Login to Resend:**
- URL: https://resend.com/login
- Check your account

**Verify:**
1. **API Key Status**
   - Go to **API Keys** section
   - Check if key is active (not revoked/expired)
   
2. **Domain Verification**
   - Go to **Domains** section
   - Check `newforestdevicerepairs.co.uk` status
   - Should show: ✓ Verified
   
3. **Recent Emails**
   - Go to **Emails** section
   - Check for recent send attempts
   - Look for errors or bounces

**Common Issues:**
- ❌ Domain verification expired
- ❌ API key revoked or regenerated
- ❌ Sending limits reached
- ❌ Domain DNS records changed

---

### **3. Check Email Logs in Database**

**Query email_logs table:**
```sql
SELECT 
  id,
  job_id,
  template_key,
  subject,
  recipient_email,
  status,
  sent_at,
  error_message,
  created_at
FROM email_logs
ORDER BY created_at DESC
LIMIT 20;
```

**Look for:**
- `status = 'FAILED'` - Check `error_message` column
- `status = 'PENDING'` - Email queued but never sent
- No recent records - Emails not being triggered

---

### **4. Check Notification Config**

**Query notification_config:**
```sql
SELECT 
  status_key,
  status_label,
  send_email,
  is_active
FROM notification_config
ORDER BY status_key;
```

**Verify:**
- `send_email = true` for statuses that should send emails
- `is_active = true` for active statuses

**If disabled:**
- Go to app → Settings → Notifications
- Enable email for desired statuses

---

### **5. Check Browser Console**

When changing job status in the app:

1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Change a job status
4. Look for:
   - `🔔 Queueing notifications for status: RECEIVED`
   - `Email disabled for status: RECEIVED` (if disabled)
   - API errors or failures

---

### **6. Check Vercel Logs**

**View production logs:**
1. Go to Vercel Dashboard
2. Select project
3. Go to **Deployments**
4. Click latest deployment
5. Click **Functions** tab
6. Look for `/api/email/send` logs

**Look for:**
- `RESEND_API_KEY not configured - email not sent`
- `Failed to send email:` errors
- Resend API errors

---

## 🔧 **Common Fixes**

### **Fix 1: API Key Not Set**
```bash
# In Vercel Dashboard:
Settings → Environment Variables → Add Variable
Key: RESEND_API_KEY
Value: re_your_actual_key
Environments: Production, Preview, Development
→ Save
→ Redeploy app
```

### **Fix 2: Domain Not Verified**
1. Go to Resend Dashboard → Domains
2. Click on `newforestdevicerepairs.co.uk`
3. Follow verification instructions
4. Add DNS records to domain provider
5. Wait for verification (can take up to 48 hours)

### **Fix 3: Emails Disabled in Config**
1. Go to app → Settings → Notifications
2. Find the status (e.g., RECEIVED)
3. Toggle "Send Email" to ON
4. Click Save

### **Fix 4: No Customer Email**
- Check job has `customer_email` field populated
- Update job to add email address

---

## 🧪 **Test Email Sending**

### **Manual Test via API:**

```bash
curl -X POST https://nfd-repairs-app.vercel.app/api/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "your-job-id-here",
    "type": "STATUS_UPDATE"
  }'
```

**Expected response:**
```json
{
  "success": true
}
```

**Error response:**
```json
{
  "error": "Failed to send email",
  "details": "..."
}
```

---

## 📊 **Email Flow**

```
1. Status Change Triggered
   ↓
2. Check notification_config
   ↓ (if send_email = true)
3. Call /api/email/send
   ↓
4. Check RESEND_API_KEY
   ↓ (if configured)
5. Generate email template
   ↓
6. Log to email_logs (status: PENDING)
   ↓
7. Call Resend API
   ↓
8. Update email_logs (status: SENT or FAILED)
   ↓
9. Add job_event (if successful)
```

---

## 🚨 **Most Likely Issues**

Based on "emails worked before but stopped":

1. **RESEND_API_KEY removed/changed in Vercel** (90% likely)
   - Someone may have regenerated the API key in Resend
   - Environment variable not set after redeployment
   
2. **Domain verification expired** (5% likely)
   - DNS records changed
   - Domain ownership verification needed
   
3. **Notification config disabled** (3% likely)
   - Someone toggled off email notifications
   
4. **Resend account issue** (2% likely)
   - Billing issue
   - Account suspended
   - Sending limits reached

---

## ✅ **Quick Fix Steps**

1. **Check Vercel env vars** - Is `RESEND_API_KEY` set?
2. **Check Resend dashboard** - Is API key active? Domain verified?
3. **Check email_logs** - Are emails failing? What's the error?
4. **Redeploy** - After fixing env vars, redeploy the app
5. **Test** - Change a job status and check if email sends

---

## 📞 **Need Help?**

If emails still not working after checking all above:
1. Check email_logs for specific error messages
2. Check Vercel function logs for API errors
3. Contact Resend support if API key/domain issues
4. Verify customer email addresses are valid
