const CACHE_NAME = 'nfd-repairs-v3'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/login',
      ])
    })
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Network-first for navigation requests (HTML pages) - always get fresh content
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone)
          })
          return response
        })
        .catch(() => {
          return caches.match(request).then((response) => {
            return response || caches.match('/login')
          })
        })
    )
    return
  }

  // Cache-first for static assets (JS, CSS, images)
  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'image') {
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request).then((fetchResponse) => {
          if (fetchResponse.ok) {
            const responseClone = fetchResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone)
            })
          }
          return fetchResponse
        })
      })
    )
    return
  }

  // Default: try network, fall back to cache
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request)
    })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => {
      return self.clients.claim()
    })
  )
})

// Push notification handler with enhanced customization
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'NFD Repairs'
  
  // Determine notification type and customize accordingly
  const notificationType = data.type || 'default'
  
  // Custom vibration patterns based on notification type
  const vibrationPatterns = {
    'NEW_JOB': [200, 100, 200, 100, 200], // Excited pattern
    'WARRANTY_CLAIM': [300, 100, 300, 100, 300], // Urgent pattern (customer needs help)
    'PARTS_ARRIVED': [300, 100, 300], // Urgent pattern
    'READY_TO_COLLECT': [100, 50, 100, 50, 100, 50, 100], // Happy pattern
    'URGENT': [500, 200, 500], // Strong urgent pattern
    'default': [200, 100, 200]
  }
  
  // Custom tags for notification grouping
  const tag = data.jobId ? `job-${data.jobId}` : 'general'
  
  // Determine if notification should be silent (for low priority updates)
  const silent = data.silent || false
  
  // Require interaction for important notifications
  const requireInteraction = ['WARRANTY_CLAIM', 'PARTS_ARRIVED', 'READY_TO_COLLECT', 'URGENT'].includes(notificationType)
  
  const options = {
    body: data.body || 'New notification',
    icon: '/icons/icon-192x192.svg',
    badge: '/icons/icon-96x96.svg',
    vibrate: vibrationPatterns[notificationType] || vibrationPatterns.default,
    tag: tag, // Groups notifications by job
    renotify: true, // Re-alert even if notification with same tag exists
    requireInteraction: requireInteraction, // Stays visible until user interacts
    silent: silent,
    timestamp: Date.now(),
    data: {
      url: data.url || '/app/jobs',
      jobId: data.jobId,
      type: notificationType,
      timestamp: Date.now()
    },
    actions: [
      {
        action: 'view',
        title: '👁️ View Job',
        icon: '/icons/icon-96x96.svg'
      },
      {
        action: 'close',
        title: '✕ Dismiss',
      },
    ],
  }
  
  // Add image for specific notification types
  if (notificationType === 'READY_TO_COLLECT' || notificationType === 'PARTS_ARRIVED') {
    options.image = '/icons/icon-512x512.svg' // Large image for important notifications
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'view' || !event.action) {
    const urlToOpen = event.notification.data.url || '/app/jobs'
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Check if there's already a window open
        for (const client of clientList) {
          if (client.url.includes('/app') && 'focus' in client) {
            client.focus()
            client.navigate(urlToOpen)
            return
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen)
        }
      })
    )
  }
})
