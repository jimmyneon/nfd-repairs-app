# PWA & Push Notifications Setup Guide

## Overview

The repair app is now a **Progressive Web App (PWA)** that can be installed on mobile devices and send push notifications to staff members.

## Features

✅ **Installable** - Add to home screen on iOS/Android  
✅ **Offline Support** - Service worker caches key pages  
✅ **Push Notifications** - Real-time alerts for new jobs and updates  
✅ **App Shortcuts** - Quick access to Jobs and Notifications  

---

## Installation

### 1. Generate VAPID Keys

VAPID keys are required for push notifications:

```bash
cd repair-app
npx web-push generate-vapid-keys
```

Copy the output and add to `.env.local`:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BNxxx...
VAPID_PRIVATE_KEY=xxx...
```

### 2. Create App Icons

Create PNG icons in `/public/icons/` with these sizes:
- 72x72, 96x96, 128x128, 144x144
- 152x152, 192x192, 384x384, 512x512

**Quick way**: Use a tool like [PWA Asset Generator](https://www.pwabuilder.com/imageGenerator) with your logo.

### 3. Deploy

The PWA features work automatically once deployed. The service worker (`/public/sw.js`) will be registered on first visit.

---

## How It Works

### PWA Installation

**On Mobile (iOS/Android)**:
1. Visit the app in browser
2. Browser shows "Add to Home Screen" prompt
3. App installs like a native app
4. Opens in standalone mode (no browser UI)

**On Desktop**:
1. Chrome/Edge show install button in address bar
2. Click to install
3. App opens in its own window

### Push Notifications

**Staff Setup**:
1. Login to app
2. Notification permission prompt appears after 3 seconds
3. Click "Enable Notifications"
4. Browser requests permission
5. Subscription saved to database

**Sending Notifications**:

Notifications are sent automatically when:
- New job created
- Job status changes
- Action required (e.g., deposit received)

**Manual Send** (for testing):

```bash
curl -X POST https://your-app.com/api/notifications/send-push \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Job",
    "body": "iPhone 13 Pro screen repair",
    "url": "/app/jobs/123",
    "jobId": "123"
  }'
```

---

## Notification Triggers

The app automatically sends push notifications via the `/api/notifications/send-push` endpoint when:

1. **New Job Created** (`POST /api/jobs/create`)
2. **Status Changed** (via job detail page actions)
3. **Deposit Received** (manual button press)

### Integration Example

In your job creation endpoint:

```typescript
// After creating job, send push notification
await fetch('/api/notifications/send-push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'New Repair Job',
    body: `${job.device_summary} - ${job.job_ref}`,
    url: `/app/jobs/${job.id}`,
    jobId: job.id,
  }),
})
```

---

## Testing

### Test PWA Installation

**iOS (Safari)**:
1. Visit app on iPhone
2. Tap Share button
3. Tap "Add to Home Screen"
4. Open from home screen

**Android (Chrome)**:
1. Visit app
2. Tap "Add to Home Screen" banner
3. Or: Menu → "Install App"

### Test Push Notifications

1. Enable notifications in app
2. Close/minimize app
3. Send test notification via API
4. Notification should appear even when app is closed

**Check subscription**:
```sql
SELECT * FROM push_subscriptions;
```

---

## Manifest Configuration

The app manifest (`/public/manifest.json`) defines:

- **Name**: "NFD Repairs - Job Management"
- **Short Name**: "NFD Repairs"
- **Start URL**: `/app/jobs`
- **Display**: Standalone (fullscreen app)
- **Theme Color**: #009B4D (primary green)
- **Background**: #FAF5E9 (light background)

### App Shortcuts

Two shortcuts are configured:
1. **View Jobs** → `/app/jobs`
2. **Notifications** → `/app/notifications`

---

## Service Worker

The service worker (`/public/sw.js`) handles:

1. **Caching** - Offline support for key pages
2. **Push Events** - Receives push notifications
3. **Notification Clicks** - Opens app to relevant page

### Cached Pages

- `/app/jobs`
- `/app/notifications`
- `/login`

---

## Browser Support

| Feature | Chrome | Safari | Firefox | Edge |
|---------|--------|--------|---------|------|
| PWA Install | ✅ | ✅ | ✅ | ✅ |
| Push Notifications | ✅ | ✅ (iOS 16.4+) | ✅ | ✅ |
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| Add to Home Screen | ✅ | ✅ | ✅ | ✅ |

**Note**: iOS Safari requires iOS 16.4+ for push notifications.

---

## Troubleshooting

### Notifications Not Working

1. **Check VAPID keys** - Ensure they're set in environment variables
2. **Check permissions** - Browser must grant notification permission
3. **Check subscription** - Verify entry exists in `push_subscriptions` table
4. **Check service worker** - Open DevTools → Application → Service Workers

### PWA Not Installing

1. **HTTPS required** - PWA only works on HTTPS (or localhost)
2. **Manifest valid** - Check `/manifest.json` loads correctly
3. **Icons present** - Ensure all icon files exist in `/public/icons/`

### Service Worker Issues

**Clear and re-register**:
```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(r => r.unregister())
})
```

Then refresh the page.

---

## Security

### VAPID Keys
- **Public key**: Safe to expose (in client-side code)
- **Private key**: Keep secret (server-side only)
- Never commit private key to git

### Subscriptions
- Stored per user in database
- Automatically cleaned up if invalid (410 status)
- RLS policies protect access

---

## Production Checklist

- [ ] VAPID keys generated and configured
- [ ] App icons created (all sizes)
- [ ] Manifest.json configured
- [ ] Service worker tested
- [ ] Push notifications tested
- [ ] PWA installable on iOS/Android
- [ ] HTTPS enabled (required for PWA)
- [ ] Icons display correctly
- [ ] Offline mode works

---

## Future Enhancements

- [ ] Background sync for offline actions
- [ ] Notification actions (e.g., "View Job" button)
- [ ] Badge API for unread count on app icon
- [ ] Web Share API for sharing job links
- [ ] Periodic background sync for updates

---

## Resources

- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Web Push Protocol](https://web.dev/push-notifications-overview/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [VAPID Keys](https://github.com/web-push-libs/web-push#command-line)
