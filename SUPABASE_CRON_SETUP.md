# Supabase pg_cron Setup for Post-Collection SMS

## 📋 What This Does

Uses Supabase's built-in PostgreSQL cron (pg_cron) to check for scheduled post-collection SMS every 15 minutes and send them automatically.

**No external services needed!** Everything runs inside Supabase.

---

## 🔧 Setup Instructions

### Step 1: Enable pg_cron Extension in Supabase

1. Go to **Supabase Dashboard**
2. Select your project
3. Go to **Database** → **Extensions**
4. Search for **pg_cron**
5. Click **Enable** (if not already enabled)

**Note:** pg_cron is available on all Supabase plans including free tier.

---

### Step 2: Enable HTTP Extension (Required)

The cron job needs to make HTTP requests to your API.

1. Still in **Database** → **Extensions**
2. Search for **http**
3. Click **Enable**

---

### Step 3: Run the Setup SQL

1. Go to **SQL Editor** in Supabase
2. Click **New Query**
3. Copy and paste the contents of `supabase/setup-pg-cron.sql`
4. Click **Run**

**What this does:**
- Creates a function to call your API endpoint
- Schedules it to run every 15 minutes
- Uses your CRON_SECRET for authentication

---

### Step 4: Verify It's Working

After running the SQL, verify the cron job was created:

```sql
SELECT * FROM cron.job;
```

You should see:
```
jobid | schedule      | command                                  | nodename
------|---------------|------------------------------------------|----------
1     | */15 * * * *  | SELECT send_scheduled_collection_sms();  | ...
```

---

### Step 5: Check Execution History (After 15 Minutes)

Wait 15 minutes, then check if it ran:

```sql
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

You should see execution records with status `succeeded`.

---

## 🔍 Monitoring & Troubleshooting

### Check if Cron Job Exists

```sql
SELECT * FROM cron.job;
```

### View Recent Executions

```sql
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

### Check for Errors

```sql
SELECT * FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY start_time DESC;
```

### Manually Trigger the Function (Testing)

```sql
SELECT send_scheduled_collection_sms();
```

---

## 🛑 Disable/Remove Cron Job

### Temporarily Disable

```sql
SELECT cron.unschedule('send-collection-sms-every-15-min');
```

### Re-enable

```sql
SELECT cron.schedule(
  'send-collection-sms-every-15-min',
  '*/15 * * * *',
  'SELECT send_scheduled_collection_sms();'
);
```

### Permanently Delete

```sql
SELECT cron.unschedule('send-collection-sms-every-15-min');
DROP FUNCTION IF EXISTS send_scheduled_collection_sms();
```

---

## 🔒 Security Notes

- The CRON_SECRET is hardcoded in the function for simplicity
- The function uses `SECURITY DEFINER` to run with elevated privileges
- Only the function can call the API endpoint (protected by secret)
- HTTP extension is required but safe (only makes outbound requests)

---

## ⏰ Schedule Format

The cron schedule `*/15 * * * *` means:

```
*/15  *  *  *  *
 |    |  |  |  |
 |    |  |  |  +-- Day of week (0-7, Sunday = 0 or 7)
 |    |  |  +----- Month (1-12)
 |    |  +-------- Day of month (1-31)
 |    +----------- Hour (0-23)
 +---------------- Minute (0-59, */15 = every 15 minutes)
```

**Examples:**
- `*/15 * * * *` - Every 15 minutes
- `0 10 * * *` - Once daily at 10:00 AM
- `0 */2 * * *` - Every 2 hours
- `0 9-17 * * *` - Every hour from 9am to 5pm

---

## 📊 What Happens

1. **Every 15 minutes**, Supabase runs the cron job
2. Cron job calls `send_scheduled_collection_sms()` function
3. Function makes HTTP GET request to your API:
   ```
   GET https://nfd-repairs-app.vercel.app/api/jobs/send-collection-sms
   Authorization: Bearer {CRON_SECRET}
   ```
4. Your API checks database for scheduled SMS
5. Sends any SMS that are due
6. Returns success/failure response
7. Supabase logs the execution in `cron.job_run_details`

---

## ✅ Advantages Over Vercel Cron

- ✅ **Free** on all Supabase plans
- ✅ **Runs every 15 minutes** (not limited to daily)
- ✅ **Built-in monitoring** via job_run_details
- ✅ **No external dependencies**
- ✅ **Reliable** - runs inside your database
- ✅ **Easy to debug** - SQL-based logs

---

## 🚀 Next Steps After Setup

1. Remove Vercel cron from `vercel.json` (already done)
2. Test by marking a job as COLLECTED
3. Wait 15 minutes and check if SMS was sent
4. Monitor `cron.job_run_details` for execution logs

---

## 🆘 Common Issues

### "Extension pg_cron not found"
- Enable pg_cron extension in Database → Extensions

### "Extension http not found"
- Enable http extension in Database → Extensions

### "Permission denied"
- The function uses SECURITY DEFINER, should work automatically
- If issues persist, check database user permissions

### "HTTP request failed"
- Verify your app is deployed and accessible
- Check CRON_SECRET matches environment variable
- Test API endpoint manually with curl

### "No SMS being sent"
- Check if jobs have `post_collection_sms_scheduled_at` set
- Verify scheduled time is in the past
- Check `post_collection_sms_sent_at` is NULL
- Look at API logs in Vercel

---

## 📝 Summary

**What you need to do:**
1. Enable `pg_cron` extension in Supabase
2. Enable `http` extension in Supabase
3. Run `setup-pg-cron.sql` in SQL Editor
4. Verify with `SELECT * FROM cron.job;`
5. Done! SMS will send every 15 minutes automatically

**Total setup time:** ~5 minutes

**Cost:** Free (included in Supabase free tier)
