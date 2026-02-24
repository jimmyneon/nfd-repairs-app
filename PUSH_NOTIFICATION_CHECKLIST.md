# Push Notification Checklist

## ✅ What's Working
- [x] Subscription saved to database
- [x] Service worker code exists (`/public/sw.js`)
- [x] Subscribe button in Settings → Notifications

## 🔍 What to Check Now

### 1. **VAPID Keys in Vercel** (MOST LIKELY ISSUE)

Push notifications require VAPID keys to be set in Vercel environment variables.

**Check if they exist:**
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Look for:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`

**If they don't exist, generate and add them:**

```bash
npx web-push generate-vapid-keys
```

This will output:
```
Public Key: BKxxx...
Private Key: xxx...
```

Add both to Vercel:
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = the public key
- `VAPID_PRIVATE_KEY` = the private key

**Important:** After adding, redeploy the app!

---

### 2. **Service Worker Registration**

Open browser DevTools → Application → Service Workers

**Should see:**
- Status: "activated and is running"
- Source: `/sw.js`

**If not registered:**
- Check browser console for errors
- Try hard refresh (Cmd+Shift+R / Ctrl+Shift+F5)

---

### 3. **Browser Notification Permission**

Check: Settings → Notifications → Permission Status

**Should show:** "granted"

**If not:**
- Click "Subscribe to Push Notifications"
- Allow when browser prompts

---

### 4. **Test Push Notification**

Once VAPID keys are set and service worker is registered:

1. Go to Settings → Notifications
2. Subscription Status should show "Active"
3. Click "Send Test Notification"
4. Check browser console for errors
5. Should receive notification

---

### 5. **Check Browser Console**

Look for errors like:
- "VAPID keys not configured"
- "Failed to subscribe"
- "Service worker registration failed"

---

## 🐛 Common Issues

### "Push notifications not configured. VAPID keys missing."
→ VAPID keys not set in Vercel. See step 1 above.

### "Service worker registration failed"
→ Check `/public/sw.js` exists and is accessible at `https://yourapp.vercel.app/sw.js`

### "Notification permission denied"
→ User blocked notifications. Need to reset in browser settings or use different browser.

### Notifications work locally but not in production
→ VAPID keys not set in Vercel environment variables

---

## 📝 Environment Variables Needed

**Local (.env.local):**
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BKxxx...
VAPID_PRIVATE_KEY=xxx...
```

**Vercel (Production):**
Same variables must be set in Vercel Dashboard → Settings → Environment Variables

---

## 🧪 Quick Test

Run this in browser console on your app:
```javascript
// Check if service worker is registered
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('Service Worker:', reg ? 'Registered' : 'Not registered')
})

// Check notification permission
console.log('Notification permission:', Notification.permission)

// Check if subscribed
fetch('/api/notifications/subscribe', {
  method: 'GET'
}).then(r => r.json()).then(console.log)
```
