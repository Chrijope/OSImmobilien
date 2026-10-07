// MOREImmo CRM Service Worker — Web Push only (no caching)
const CACHE_NAME = "moreimmo-push-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "MOREImmo", body: event.data.text() };
  }

  const title = payload.title || "MOREImmo";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.png",
    badge: payload.badge || "/favicon.png",
    tag: payload.tag || "moreimmo-default",
    data: { url: payload.url || "/", tag: payload.tag },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url && new URL(client.url).pathname === new URL(url, self.location.origin).pathname) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      })
  );
});
