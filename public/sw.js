/* Service worker for ਸਹਿਜ ਪਾਠ ਖੋਜ — Web Push notifications */

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'ਸਹਿਜ ਪਾਠ ਖੋਜ', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'ਸਹਿਜ ਪਾਠ ਖੋਜ'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'shabad',
    data: { url: payload.url || '/jhalak' },
    vibrate: [80, 40, 80],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/jhalak'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) client.navigate(target)
          return
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })
  )
})
