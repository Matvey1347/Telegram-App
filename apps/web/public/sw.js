function notificationTarget(targetUrl) {
  if (typeof targetUrl !== "string") return "/";
  try {
    const target = new URL(targetUrl, self.location.origin);
    if (target.origin !== self.location.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

function notificationRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function notificationText(value, fallback, limit) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit);
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = notificationRecord(event.data ? event.data.json() : {});
  } catch {
    payload = {};
  }
  const notification = notificationRecord(payload.notification || payload);
  const notificationId = notificationText(notification.id || payload.tag, "operations-notification", 200);
  const targetUrl = notification.targetUrl || notificationRecord(notification.data).targetUrl || notificationRecord(payload.data).targetUrl;
  // The backend applies recipient privacy preferences before constructing this payload.
  // The worker never fetches a message or infers whether the current chat is read.
  event.waitUntil(self.registration.showNotification(
    notificationText(notification.title, "New workspace activity", 120),
    {
      body: notificationText(notification.body, "Open Nexeloq to review the update.", 240),
      icon: "/brand/nexeloq-pwa-192.png",
      badge: "/brand/nexeloq-pwa-192.png",
      tag: notificationId,
      renotify: false,
      data: { targetUrl: notificationTarget(targetUrl) },
    },
  ));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = notificationTarget(event.notification.data?.targetUrl);
  const absoluteTarget = new URL(targetUrl, self.location.origin).href;
  const openTarget = () => self.clients.openWindow(absoluteTarget).catch(() => null);
  event.waitUntil((async () => {
    let windowClients;
    try {
      windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    } catch {
      return openTarget();
    }
    const clients = windowClients.filter((candidate) => {
      try { return new URL(candidate.url).origin === self.location.origin; }
      catch { return false; }
    });
    const client = clients.find((candidate) => candidate.url === absoluteTarget) || clients[0];
    if (!client) return openTarget();
    try {
      if (client.url === absoluteTarget) return await client.focus();
      if (typeof client.navigate === "function") {
        const navigated = await client.navigate(absoluteTarget);
        if (!navigated) return openTarget();
        return await navigated.focus();
      }
      client.postMessage({ type: "notification.navigate", targetUrl });
      return await client.focus();
    } catch {
      return openTarget();
    }
  })());
});
