# Manual Job Creation - Improvements Summary

## ✅ What's Been Done

### 1. **Improved Form with Dropdowns**

**Device Type Dropdown:**
- Mobile Phone
- Tablet
- Laptop
- Desktop PC
- Gaming Console
- Other

**Make Dropdown (Filtered by Device Type):**
- **Phones:** Apple, Samsung, Google, OnePlus, Huawei, Motorola, Nokia, Sony, Other
- **Tablets:** Apple, Samsung, Amazon, Lenovo, Microsoft, Huawei, Other
- **Laptops:** Apple, Dell, HP, Lenovo, Asus, Acer, Microsoft, MSI, Razer, Other
- **Desktops:** Dell, HP, Lenovo, Asus, Acer, Custom Build, Other
- **Consoles:** Sony PlayStation, Microsoft Xbox, Nintendo Switch, Nintendo, Other

**Common Issues Dropdown:**
- Screen Replacement
- Battery Replacement
- Charging Port Replacement
- Not Charging
- No Power
- Water Damage
- Data Recovery
- Windows 10/11 Installation
- Software Glitches
- Not Loading
- Black Screen
- Blue Screen of Death
- SSD Upgrade
- Hard Drive Replacement
- RAM Upgrade
- HDMI Port Repair
- Software Malfunction
- Overheating
- Virus Removal
- Other

### 2. **Removed Signature Canvas**

- Replaced with simple checkbox for terms acceptance
- No photo storage needed (saves Supabase storage costs)
- Simpler, faster workflow

### 3. **Database Changes Needed**

**Run this SQL in Supabase:**
```sql
-- File: supabase/add-device-type-field.sql
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS device_type TEXT;

COMMENT ON COLUMN jobs.device_type IS 'Device category: phone, tablet, laptop, desktop, console, other';

CREATE INDEX IF NOT EXISTS idx_jobs_device_type ON jobs(device_type);
```

---

## 🔧 Still To Do

### 1. **Fix SMS Flow for Manual Entry**

**Current Problem:**
- Manual job creation sends "bring it in at your convenience" SMS
- Should send "we've received your device" SMS instead

**Solution Needed:**
- Update SMS templates to check `source` field
- If `source = 'staff_manual'` → Send "RECEIVED" template
- If `source = 'online'` or `source = 'ai_responder'` → Send "READY_TO_BOOK_IN" template

### 2. **Add Google Maps Link**

**What's Needed:**
- Add `google_maps_link` to `admin_settings` table
- Add field in Admin Settings page
- Include in SMS templates with text like:
  ```
  Find us here: {googleMapsLink}
  ```

### 3. **Shorten Tracking URLs**

**Current URL:**
```
https://nfd-repairs-app.vercel.app/t/{tracking_token}
```

**Options:**
1. **Custom domain** (e.g., `nfd.repair/t/{token}`)
2. **URL shortener service** (e.g., Bitly API)
3. **Database-based shortener** (create short codes in database)

**Recommendation:** Custom short domain is best long-term

### 4. **Define All Job Statuses and SMS Flow**

Need to clarify SMS for each status based on job source:

| Status | Manual Entry SMS | Online Entry SMS |
|--------|------------------|------------------|
| RECEIVED | "Device received, in queue" | N/A |
| AWAITING_DEPOSIT | "£20 deposit required" | "£20 deposit required" |
| PARTS_ORDERED | "Parts ordered" | "Parts ordered" |
| READY_TO_BOOK_IN | N/A | "Bring device in at convenience" |
| IN_REPAIR | "Device being repaired" | "Device being repaired" |
| READY_TO_COLLECT | "Ready for collection" + Google Maps | "Ready for collection" + Google Maps |
| COMPLETED | N/A (already collected) | N/A |
| COLLECTED | Post-collection review SMS (3hrs later) | Post-collection review SMS (3hrs later) |

---

## 📝 Next Steps

1. **Run SQL** to add `device_type` field
2. **Update SMS templates** to differentiate manual vs online
3. **Add Google Maps link** to admin settings
4. **Implement URL shortening** (recommend custom domain)
5. **Test full workflow** with manual job creation

---

## 🎯 Benefits of Changes

✅ **Faster data entry** - Dropdowns instead of typing
✅ **Consistent data** - Standardized device types and issues
✅ **No photo storage** - Simple checkbox instead of signature
✅ **Better filtering** - Can filter jobs by device type
✅ **Easier reporting** - Standardized issue categories

---

## 🚀 Deployment Status

**Committed:** `efd5e43` - "Overhaul manual job creation"

**Files Changed:**
- `app/app/jobs/create/page.tsx` - New form with dropdowns
- `supabase/add-device-type-field.sql` - Database migration
- `app/api/jobs/create-v3/route.ts` - Accepts device_type field

**Ready to push and deploy!**
