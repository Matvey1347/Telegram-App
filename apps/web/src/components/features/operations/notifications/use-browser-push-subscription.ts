"use client";

import type { OperationsNotificationPreferences, OperationsNotificationPushConfig, OperationsPushSubscriptionInput } from "@telegram-system/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { operationsNotificationsApi } from "@/lib/features/operations/operations-notifications-api";
import { useNotificationServiceWorker } from "@/providers/notification-service-worker-provider";

function vapidKeyBytes(value: string) {
  const binary = window.atob((value + "=".repeat((4 - value.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function pushSubscriptionInput(subscription: PushSubscription): OperationsPushSubscriptionInput {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) throw new Error("Incomplete browser subscription");
  return { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh, auth: value.keys.auth }, userAgent: navigator.userAgent || null };
}

type PushStatus = "off" | "unsupported" | "denied" | "unconfigured" | "active" | "stale" | "default" | "granted";

/** Browser lifecycle only; permission is requested exclusively by turnOn's user action. */
export function useBrowserPushSubscription({ preferences, config, reconcile }: {
  preferences?: OperationsNotificationPreferences;
  config?: OperationsNotificationPushConfig;
  reconcile: (value: OperationsNotificationPreferences) => void;
}) {
  const { supported, registration, registrationError } = useNotificationServiceWorker();
  const pushSupported = supported && typeof window !== "undefined" && "Notification" in window && "PushManager" in window;
  const [permission, setPermission] = useState<NotificationPermission>(() => typeof Notification === "undefined" ? "default" : Notification.permission);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [checked, setChecked] = useState(false);
  const [checkError, setCheckError] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!registration || !pushSupported) return;
    let active = true;
    void registration.pushManager.getSubscription().then((current) => {
      if (!active) return;
      setSubscription(current);
      setCheckError(false);
      setChecked(true);
    }).catch(() => {
      if (!active) return;
      setCheckError(true);
      setChecked(true);
    });
    return () => { active = false; };
  }, [pushSupported, registration]);

  useEffect(() => {
    if (!pushSupported) return;
    const update = () => setPermission(Notification.permission);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [pushSupported]);

  const turnOn = useMutation({
    mutationFn: async () => {
      if (!pushSupported || !config?.enabled || !config.publicKey) throw new Error("Push unavailable");
      let granted = Notification.permission;
      if (granted === "default") {
        granted = await Notification.requestPermission();
        if (!mounted.current) return;
        setPermission(granted);
      }
      if (granted !== "granted") throw new Error("Notification permission denied");
      const worker = registration ?? await navigator.serviceWorker.ready;
      let current = await worker.pushManager.getSubscription();
      if (!mounted.current) return;
      let created = false;
      if (!current) {
        current = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(config.publicKey) });
        created = true;
      }
      if (!mounted.current) return;
      try {
        reconcile(await operationsNotificationsApi.addPushSubscription(pushSubscriptionInput(current)));
      } catch (error) {
        if (created) await current.unsubscribe().catch(() => false);
        throw error;
      }
      if (!mounted.current) return;
      setSubscription(current);
      setChecked(true);
      if (!preferences?.webPushEnabled) reconcile(await operationsNotificationsApi.updatePreferences(true));
    },
  });
  const turnOff = useMutation({
    mutationFn: async () => {
      if (preferences?.webPushEnabled) reconcile(await operationsNotificationsApi.updatePreferences(false));
    },
  });
  const active = Boolean(pushSupported && permission === "granted" && subscription && preferences?.webPushEnabled && preferences.activeSubscriptionCount > 0);
  const stale = Boolean(preferences?.webPushEnabled && (!pushSupported || checked) && (!subscription || preferences.activeSubscriptionCount === 0));
  let status: PushStatus = "off";
  if (!pushSupported) status = "unsupported";
  else if (permission === "denied") status = "denied";
  else if (!config?.enabled) status = "unconfigured";
  else if (active) status = "active";
  else if (stale) status = "stale";
  else if (permission === "default") status = "default";
  else if (permission === "granted") status = "granted";
  return { pushSupported, permission, subscription, checkError, registrationError, active, stale, status, turnOn, turnOff,
    pending: turnOn.isPending || turnOff.isPending, error: turnOn.error ?? turnOff.error };
}
