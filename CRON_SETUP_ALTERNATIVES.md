# Cron Job Setup - Alternatives for Hobby Plan

## ⚠️ Vercel Hobby Plan Limitation

**Vercel Hobby (Free) Plan:** Cron jobs can only run **once per day**

This means the post-collection SMS system will only check for scheduled SMS once daily at 10am, not every 15 minutes.

---

## 🎯 Current Setup (Hobby Plan)

**Schedule:** Once daily at 10:00 AM
```json
{
  "crons": [{
    "path": "/api/jobs/send-collection-sms",
    "schedule": "0 10 * * *"
  }]
}
```

**What this means:**
- SMS scheduled for 11am will be sent at 10am next day (delayed)
- SMS scheduled for 2pm will be sent at 10am next day (delayed)
- Only SMS scheduled before 10am will be sent on time

---

## ✅ Solution 1: External Cron Service (FREE)

Use a free external cron service to run every 15 minutes:

### **Recommended: cron-job.org**

1. Go to https://cron-job.org
2. Create free account
3. Create new cron job:
   - **URL:** `https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms`
   - **Schedule:** Every 15 minutes
   - **Method:** GET
   - **Headers:** 
     ```
     Authorization: Bearer 74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263
     ```

### **Alternative: EasyCron**

1. Go to https://www.easycron.com
2. Create free account (up to 100 executions/day)
3. Create cron job:
   - **URL:** `https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms`
   - **Cron Expression:** `*/15 * * * *` (every 15 minutes)
   - **HTTP Method:** GET
   - **Custom Headers:**
     ```
     Authorization: Bearer 74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263
     ```

---

## ✅ Solution 2: Upgrade to Vercel Pro

**Cost:** $20/month

**Benefits:**
- Unlimited cron jobs
- Can run every 15 minutes
- Better performance
- More build minutes

**To upgrade:**
1. Go to Vercel Dashboard
2. Settings → Billing
3. Upgrade to Pro plan

Then update `vercel.json` back to:
```json
{
  "crons": [{
    "path": "/api/jobs/send-collection-sms",
    "schedule": "*/15 * * * *"
  }]
}
```

---

## 🔧 How to Switch to External Cron

### Step 1: Remove Vercel Cron (Optional)

Edit `vercel.json` and remove the crons section:
```json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "nextjs",
  "regions": ["lhr1"]
}
```

### Step 2: Set Up External Service

Use cron-job.org or EasyCron as described above.

### Step 3: Test

After setup, manually trigger to test:
```bash
curl -X GET https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms \
  -H "Authorization: Bearer 74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263"
```

Should return:
```json
{
  "success": true,
  "count": 0,
  "results": []
}
```

---

## 📊 Comparison

| Solution | Cost | Frequency | Setup |
|----------|------|-----------|-------|
| Vercel Hobby | Free | Once/day | Already done |
| cron-job.org | Free | Every 15 min | 5 minutes |
| EasyCron | Free | Every 15 min | 5 minutes |
| Vercel Pro | $20/mo | Every 15 min | Upgrade + redeploy |

---

## 🎯 Recommendation

**For now:** Use **cron-job.org** (free, every 15 minutes)

**Later:** Consider Vercel Pro if you need other features

---

## 🔑 Your CRON_SECRET

```
74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263
```

Use this in the `Authorization: Bearer` header for external cron services.

---

## ⏰ Current Behavior with Hobby Plan

**Example Timeline:**

- **2:00 PM** - Job marked COLLECTED
- **5:00 PM** - SMS scheduled for 5:00 PM (3 hours later)
- **10:00 AM next day** - Cron runs, SMS sent (17 hour delay!)

**With External Cron (every 15 min):**

- **2:00 PM** - Job marked COLLECTED  
- **5:00 PM** - SMS scheduled for 5:00 PM
- **5:00 PM** - Cron runs, SMS sent immediately ✓

---

## 🚀 Quick Setup Guide (cron-job.org)

1. Visit https://cron-job.org/en/signup/
2. Create account (email + password)
3. Verify email
4. Click "Create cronjob"
5. Fill in:
   - **Title:** NFD Repairs - Post Collection SMS
   - **Address:** `https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms`
   - **Schedule:** Every 15 minutes
   - **Enabled:** Yes
6. Click "Advanced" tab
7. Add header:
   - **Name:** `Authorization`
   - **Value:** `Bearer 74f5d06ea99badfeb73748de6b4efbc96f6c8aee489aafb1d2d7a573eb221263`
8. Save

**Done!** Your SMS will now send every 15 minutes instead of once daily.
