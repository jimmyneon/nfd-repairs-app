# Hostinger Auto-Reply Setup Instructions

## How to Set Up the Auto-Reply Email

### Step 1: Access Email Auto-Responder in Hostinger

1. Log in to your **Hostinger** account
2. Go to **Emails** section
3. Find the email account: `repairs@newforestdevicerepairs.co.uk`
4. Click on **Manage** or **Settings**
5. Look for **Auto-Responder** or **Vacation Responder** option

### Step 2: Configure the Auto-Reply

1. **Enable** the auto-responder
2. Set the **Subject Line**:
   ```
   Auto-Reply: This inbox is not monitored - New Forest Device Repairs
   ```

3. For the **Message Body**, you have two options:

#### Option A: HTML Email (Recommended - Looks Professional)

1. Look for an option to switch to **HTML mode** or **Rich Text Editor**
2. Copy the **entire contents** of `auto-reply-template.html`
3. Paste it into the message body field
4. If there's a "Preview" button, click it to see how it looks

#### Option B: Plain Text (If HTML not supported)

If Hostinger doesn't support HTML in auto-replies, use this plain text version:

```
Thank you for your email.

This inbox is NOT MONITORED for repair updates or new repair requests.

📱 FOR EXISTING REPAIRS:
Please use the tracking link we sent you in your original confirmation email to view your repair status and updates.

🆕 FOR NEW REPAIRS OR QUESTIONS:
Please visit: https://www.newforestdevicerepairs.co.uk/start

We appreciate your understanding and look forward to helping you!

---
New Forest Device Repairs
www.newforestdevicerepairs.co.uk
```

### Step 3: Additional Settings

- **Start Date**: Set to today (or when you want it to start)
- **End Date**: Leave blank or set to "No end date" (you want this running indefinitely)
- **Send to**: All senders (or "Everyone")
- **Frequency**: Once per sender per day (to avoid spam)

### Step 4: Save and Test

1. Click **Save** or **Activate**
2. **Test it**: Send an email to `repairs@newforestdevicerepairs.co.uk` from your personal email
3. Check if you receive the auto-reply within a few minutes

## Troubleshooting

### If HTML doesn't work:
- Some email systems strip HTML from auto-replies for security
- Use the plain text version instead
- The message will still be clear and professional

### If auto-reply isn't sending:
- Check that the auto-responder is **enabled**
- Verify the email account is active
- Check spam folder for the test email
- Wait 5-10 minutes (some systems have delays)
- Contact Hostinger support if issues persist

## Notes

- The auto-reply will only send **once per sender per day** (standard behavior)
- This prevents spam and annoying customers with multiple auto-replies
- The HTML template matches your website's professional design
- Customers get clear directions to the right place for help
