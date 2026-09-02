function notificationTarget(targetUrl) {
  try {
    const target = new URL(targetUrl || "/", self.location.origin);
    if (target.origin !== self.location.origin) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const notification = payload.notification || payload;
  const notificationId = notification.id || payload.tag;
  const targetUrl =
    notification.targetUrl || notification.data?.targetUrl || payload.data?.targetUrl;
  event.waitUntil(
    self.registration.showNotification("New CRM activity", {
      body: "Open Nexeloq to review the update.",
      icon: "/brand/telegram-system-192.png",
      badge: "/brand/telegram-system-192.png",
      tag: String(notificationId || "operations-notification"),
      data: { targetUrl: notificationTarget(targetUrl) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = notificationTarget(event.notification.data?.targetUrl);
  const absoluteTarget = new URL(targetUrl, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windowClients) => {
        const client = windowClients.find((candidate) => {
          try {
            return new URL(candidate.url).origin === self.location.origin;
          } catch {
            return false;
          }
        });
        if (!client) return self.clients.openWindow(absoluteTarget);
        if ("navigate" in client) await client.navigate(absoluteTarget);
        else client.postMessage({ type: "notification.navigate", targetUrl });
        return client.focus();
      }),
  );
});
