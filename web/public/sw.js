// Shows Web Push messages and opens their target on tap. The payload is { title, body, target? }.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Nod';
  const body = typeof data.body === 'string' ? data.body : '';
  const target = data.target && typeof data.target === 'object' ? data.target : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      // Android draws the status-bar icon from the badge's alpha only.
      badge: '/icons/badge-96.png',
      tag: target ? `${target.kind}/${target.repo}/${target.number}` : undefined,
      data: { target },
    }),
  );
});

function pathFor(target) {
  if (!target) return '/';
  return `/?open=${target.kind}/${encodeURIComponent(target.repo)}/${target.number}`;
}

// navigate() rejects on a window this worker does not control, so each window is tried in turn
// and a fresh one opens when none takes the URL.
async function openTarget(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const w of windows) {
    try {
      const client = 'navigate' in w ? await w.navigate(url) : null;
      if (client) return client.focus();
    } catch {
      // not controlled by this worker
    }
  }
  return self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(pathFor(event.notification.data && event.notification.data.target), self.location.origin).href;
  event.waitUntil(openTarget(url));
});
