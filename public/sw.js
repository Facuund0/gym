/*
  Service worker de la app (PWA + notificaciones push de Firebase Cloud Messaging).

  No usamos el SDK de Firebase acá adentro: FCM entrega los mensajes como Web Push
  estándar y este archivo los muestra. Así no hay que mantener versiones "compat"
  de Firebase ni inyectar la configuración en un archivo estático.
*/

const OFFLINE_URL = "/offline";
const CACHE = "gualda-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE_URL, "/icon-192.png"]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Solo navegación: si no hay red, mostramos la página offline.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { title: "Gualda Training", body: event.data ? event.data.text() : "" } };
  }
  const data = payload.data || {};
  const notification = payload.notification || {};
  const title = data.title || notification.title || "Gualda Training";
  const options = {
    body: data.body || notification.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || (payload.fcmOptions && payload.fcmOptions.link) || "/inicio" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inicio";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
