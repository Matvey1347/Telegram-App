"use client";

import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type NotificationServiceWorkerContextValue = {
  supported: boolean;
  registration: ServiceWorkerRegistration | null;
  registrationError: string | null;
};

const NotificationServiceWorkerContext =
  createContext<NotificationServiceWorkerContextValue>({
    supported: false,
    registration: null,
    registrationError: null,
  });

function safeSameOriginTarget(targetUrl: unknown) {
  if (typeof targetUrl !== "string") return null;
  try {
    const target = new URL(targetUrl, window.location.origin);
    if (target.origin !== window.location.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function NotificationServiceWorkerProvider({
  children,
}: PropsWithChildren) {
  const supported =
    typeof window !== "undefined" && "serviceWorker" in navigator;
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!supported) return;
    let active = true;
    void navigator.serviceWorker
      .register("/sw.js")
      .then((nextRegistration) => {
        if (active) setRegistration(nextRegistration);
      })
      .catch(() => {
        if (active) setRegistrationError("Service worker registration failed.");
      });
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== "notification.navigate") return;
      const target = safeSameOriginTarget(event.data.targetUrl);
      if (target) window.location.assign(target);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, [supported]);

  const value = useMemo(
    () => ({ supported, registration, registrationError }),
    [registration, registrationError, supported],
  );
  return (
    <NotificationServiceWorkerContext.Provider value={value}>
      {children}
    </NotificationServiceWorkerContext.Provider>
  );
}

export function useNotificationServiceWorker() {
  return useContext(NotificationServiceWorkerContext);
}
