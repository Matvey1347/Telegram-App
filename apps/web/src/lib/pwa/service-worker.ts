export function supportsServiceWorkers() {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

export function registerAppServiceWorker() {
  if (!supportsServiceWorkers()) return Promise.resolve(null);
  return navigator.serviceWorker.register("/sw.js");
}
