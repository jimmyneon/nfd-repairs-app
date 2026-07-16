# Push Notifications Customization Guide

## Overview

The repair app has a **fully customizable push notification system** with status-specific vibrations, sounds, icons, and behaviors. Push notifications are NOT just hardwired - they're highly configurable!

## What Can Be Customized

### ✅ Vibration Patterns
Different vibration patterns for different notification types:
- **NEW_JOB**: `[200, 100, 200, 100, 200]` - Excited pattern (5 vibrations)
- **PARTS_ARRIVED**: `[300, 100, 300]` - Urgent pattern (strong, 2 vibrations)
- **READY_TO_COLLECT**: `[100, 50, 100, 50, 100, 50, 100]` - Happy pattern (7 quick vibrations)
- **URGENT**: `[500, 200, 500]` - Very strong urgent pattern
- **default**: `[200, 100, 200]` - Standard pattern

### ✅ Notification Persistence
- **requireInteraction**: Important notifications (PARTS_ARRIVED, READY_TO_COLLECT) stay visible until user dismisses them
- **Regular notifications**: Auto-dismiss after a few seconds

### ✅ Notification Grouping
- Notifications are grouped by `jobId` using tags
- Multiple notifications for the same job replace each other instead of stacking
- `renotify: true` ensures user is alerted even if notification is replaced

### ✅ Visual Elements
- **Icon**: `/icons/icon-192x192.png` - Small icon shown in notification
- **Badge**: `/icons/icon-96x96.png` - Tiny icon shown in status bar
- **Image**: Large image shown for PARTS_ARRIVED and READY_TO_COLLECT notifications
- **Actions**: Two buttons - "👁️ View Job" and "✕ Dismiss"

### ✅ Silent Notifications
- Can send silent notifications (no sound/vibration) for low-priority updates
- Set `silent: true` in the payload

### ✅ Timestamps
- Each notification includes a timestamp
- Shows when the notification was created

## How to Use

### Current Implementation

Push notifications are automatically sent when:
1. **New job created** → Type: `NEW_JOB`
2. **Parts arrive** → Type: `PARTS_ARRIVED` (urgent, requires interaction)
3. **Ready to collect** → Type: `READY_TO_COLLECT` (requires interaction)
4. **Any status change** → Type: `default`

### Customizing Notification Types

Edit `public/sw.js` to add new notification types:

```javascript
const vibrationPatterns = {
  'NEW_JOB': [200, 100, 200, 100, 200],
  'PARTS_ARRIVED': [300, 100, 300],
  'READY_TO_COLLECT': [100, 50, 100, 50, 100, 50, 100],
  'YOUR_NEW_TYPE': [100, 50, 100], // Add your custom pattern
  'default': [200, 100, 200]
}
```

### Sending Custom Push Notifications

Call the API with custom parameters:

```javascript
fetch('/api/notifications/send-push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Custom Title',
    body: 'Custom message',
    url: '/app/jobs/123',
    jobId: '123',
    type: 'URGENT', // Custom type
    silent: false, // Set to true for silent notification
  })
})
```

## Device-Specific Behavior

### 🔔 Sounds
- **Browser controls sounds** - Each browser/OS has its own notification sound
- **Cannot customize sound from web app** - This is a browser/OS limitation
- Users can change notification sounds in their device settings:
  - **Windows**: Settings → System → Notifications → Choose app → Sound
  - **macOS**: System Preferences → Notifications → Chrome/Browser → Sound
  - **Android**: Settings → Apps → Browser → Notifications → Sound
  - **iOS**: Settings → Browser → Notifications → Sounds

### 📱 Vibration
- **Fully customizable** via the service worker
- Works on mobile devices (Android, iOS)
- Desktop devices may not support vibration

### 🖼️ Icons & Images
- Icons must be in `/public/icons/` directory
- Recommended sizes:
  - Icon: 192x192px
  - Badge: 96x96px
  - Image: 512x512px or larger

## Advanced Features

### Notification Actions
Users can interact with notifications without opening the app:
- **View Job**: Opens the specific job page
- **Dismiss**: Closes the notification

To add more actions, edit `public/sw.js`:

```javascript
actions: [
  {
    action: 'view',
    title: '👁️ View Job',
    icon: '/icons/icon-96x96.png'
  },
  {
    action: 'reply',
    title: '💬 Reply',
  },
  {
    action: 'close',
    title: '✕ Dismiss',
  },
]
```

### Notification Click Handling
When a notification is clicked, it:
1. Closes the notification
2. Focuses existing app window if open
3. Navigates to the job URL
4. Opens new window if no app window exists

### Notification Grouping
Notifications are grouped by job:
- Tag format: `job-{jobId}`
- Multiple notifications for same job replace each other
- Prevents notification spam

## Use Cases

### 1. New Job Alert
```javascript
{
  type: 'NEW_JOB',
  title: 'New Job: iPhone 12 Screen Repair',
  body: 'Customer: John Smith',
  vibrate: [200, 100, 200, 100, 200] // Excited pattern
}
```

### 2. Urgent Parts Arrival
```javascript
{
  type: 'PARTS_ARRIVED',
  title: 'Parts Arrived!',
  body: 'Please drop off your device',
  requireInteraction: true, // Stays visible
  vibrate: [300, 100, 300] // Strong urgent pattern
}
```

### 3. Ready to Collect
```javascript
{
  type: 'READY_TO_COLLECT',
  title: 'Repair Complete!',
  body: 'Your device is ready',
  requireInteraction: true,
  image: '/icons/icon-512x512.png', // Large image
  vibrate: [100, 50, 100, 50, 100, 50, 100] // Happy pattern
}
```

### 4. Silent Background Update
```javascript
{
  type: 'default',
  title: 'Status Update',
  body: 'Job status changed',
  silent: true, // No sound or vibration
}
```

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Push Notifications | ✅ | ✅ | ✅ (macOS/iOS 16.4+) | ✅ |
| Vibration | ✅ | ✅ | ❌ | ✅ |
| Actions | ✅ | ✅ | ✅ | ✅ |
| Images | ✅ | ✅ | ❌ | ✅ |
| Badge | ✅ | ✅ | ❌ | ✅ |
| requireInteraction | ✅ | ✅ | ✅ | ✅ |

## Testing

1. **Subscribe to notifications**: `/app/settings/notifications`
2. **Send test notification**: Click "Send Test Notification" button
3. **Test different types**: Modify the test button to send different types
4. **Test on mobile**: Push to production and test on actual mobile devices

## Future Enhancements

Possible additions:
- 🎨 **Custom colors** - Different notification colors per status
- 🔊 **Custom sounds** - Requires native app (PWA limitation)
- 📊 **Analytics** - Track notification open rates
- 🌐 **Multi-language** - Translate notifications based on user preference
- 📸 **Job images** - Include device photos in notifications
- ⏰ **Scheduled notifications** - Send reminders at specific times

## Limitations

### What You CAN'T Customize (Browser Limitations)
- ❌ Notification sounds (controlled by browser/OS)
- ❌ Notification UI style (controlled by browser/OS)
- ❌ Notification position on screen
- ❌ Notification duration (except requireInteraction)

### What You CAN Customize
- ✅ Vibration patterns
- ✅ Icons and images
- ✅ Title and body text
- ✅ Action buttons
- ✅ Notification behavior (silent, persistent, etc.)
- ✅ Grouping and tagging
- ✅ Click handling

## Summary

Push notifications in this app are **highly customizable** and **not hardwired**. You can:
- Create custom notification types with unique vibration patterns
- Make notifications persistent or auto-dismiss
- Add custom images for important notifications
- Group notifications by job
- Send silent notifications for low-priority updates
- Add custom action buttons

The only limitation is **sound customization**, which is controlled by the user's browser/device settings, not the web app.
