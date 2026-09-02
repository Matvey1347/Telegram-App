"use client";

import type {
  OperationsNotificationPreferences,
  OperationsPushSubscriptionInput,
} from "@telegram-system/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, BellRing, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";
import { operationsNotificationsApi } from "@/lib/features/operations/operations-notifications-api";
import { operationsNotificationKeys } from "@/lib/query-keys";
import { useNotificationServiceWorker } from "@/providers/notification-service-worker-provider";
import { InstallAppButton } from "./install-app-button";

function vapidKeyBytes(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = window.atob(
    (value + padding).replace(/-/g, "+").replace(/_/g, "/"),
  );
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function pushSubscriptionInput(
  subscription: PushSubscription,
): OperationsPushSubscriptionInput {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys.auth) {
    throw new Error("The browser returned an incomplete push subscription.");
  }
  return {
    endpoint: value.endpoint,
    keys: { p256dh: value.keys.p256dh, auth: value.keys.auth },
    userAgent: navigator.userAgent || null,
  };
}

export function NotificationPushSettings({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const queryClient = useQueryClient();
  const {
    supported: serviceWorkerSupported,
    registration,
    registrationError,
  } = useNotificationServiceWorker();
  const pushSupported =
    serviceWorkerSupported &&
    typeof window !== "undefined" &&
    "Notification" in window &&
    "PushManager" in window;
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification === "undefined" ? "default" : Notification.permission,
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [subscriptionCheckError, setSubscriptionCheckError] = useState(false);

  const preferencesQuery = useQuery({
    queryKey: operationsNotificationKeys.preferences(workspaceId),
    queryFn: ({ signal }) => operationsNotificationsApi.preferences(signal),
  });
  const configQuery = useQuery({
    queryKey: operationsNotificationKeys.pushConfig(workspaceId),
    queryFn: ({ signal }) => operationsNotificationsApi.pushConfig(signal),
  });

  useEffect(() => {
    if (!registration || !pushSupported) {
      return;
    }
    let active = true;
    void registration.pushManager
      .getSubscription()
      .then((current) => {
        if (!active) return;
        setSubscription(current);
        setSubscriptionChecked(true);
      })
      .catch(() => {
        if (!active) return;
        setSubscriptionCheckError(true);
        setSubscriptionChecked(true);
      });
    return () => {
      active = false;
    };
  }, [pushSupported, registration]);

  const setPreferencesCache = (value: OperationsNotificationPreferences) => {
    queryClient.setQueryData(
      operationsNotificationKeys.preferences(workspaceId),
      value,
    );
  };

  const turnOn = useMutation({
    mutationFn: async () => {
      if (!pushSupported)
        throw new Error("Web Push is not supported by this browser.");
      let nextPermission = Notification.permission;
      if (nextPermission === "default") {
        nextPermission = await Notification.requestPermission();
        setPermission(nextPermission);
      }
      if (nextPermission !== "granted") {
        throw new Error("Browser notification permission was denied.");
      }
      const config = configQuery.data;
      if (!config?.enabled || !config.publicKey) {
        throw new Error("Web Push is not configured for this workspace.");
      }
      const worker = registration ?? (await navigator.serviceWorker.ready);
      let current = await worker.pushManager.getSubscription();
      let created = false;
      if (!current) {
        current = await worker.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyBytes(config.publicKey),
        });
        created = true;
      }
      try {
        const registered = await operationsNotificationsApi.addPushSubscription(
          pushSubscriptionInput(current),
        );
        setPreferencesCache(registered);
      } catch (error) {
        if (created) {
          await current.unsubscribe();
        }
        throw error;
      }
      setSubscription(current);
      if (!preferencesQuery.data?.webPushEnabled) {
        const next = await operationsNotificationsApi.updatePreferences(true);
        setPreferencesCache(next);
      }
    },
  });

  const turnOff = useMutation({
    mutationFn: async () => {
      if (preferencesQuery.data?.webPushEnabled) {
        const next = await operationsNotificationsApi.updatePreferences(false);
        setPreferencesCache(next);
      }
    },
  });

  const pending = turnOn.isPending || turnOff.isPending;
  const error = turnOn.error ?? turnOff.error;
  const preferences = preferencesQuery.data;
  const subscriptionReady = !pushSupported || subscriptionChecked;
  const stale = Boolean(
    preferences?.webPushEnabled &&
    subscriptionReady &&
    (!subscription || preferences.activeSubscriptionCount === 0),
  );
  const active = Boolean(
    preferences?.webPushEnabled &&
    subscription &&
    preferences.activeSubscriptionCount > 0,
  );

  if (preferencesQuery.isLoading || configQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-400">
        <LoaderCircle size={16} className="animate-spin" /> Loading push
        settings…
      </div>
    );
  }
  if (preferencesQuery.isError || configQuery.isError) {
    return (
      <div className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-3">
        <p className="text-sm text-rose-200">
          Push settings could not be loaded.
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            void preferencesQuery.refetch();
            void configQuery.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  let status = "Push is off for this workspace.";
  if (!pushSupported) status = "Web Push is unsupported in this browser.";
  else if (permission === "denied")
    status =
      "Browser permission is denied. Enable notifications in browser settings to continue.";
  else if (!configQuery.data?.enabled)
    status = "Web Push is not configured for this workspace.";
  else if (active) status = "Push is on for this browser.";
  else if (stale)
    status =
      "Push is enabled, but this browser is not subscribed. Reconnect it to receive alerts.";
  else if (permission === "default")
    status =
      "Browser permission has not been requested. It is requested only when you select Turn on.";
  else if (permission === "granted")
    status =
      "Browser permission is granted; push remains off until you turn it on.";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-neutral-400">
            {active ? <BellRing size={18} /> : <BellOff size={18} />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">
              Browser notifications
            </p>
            <p className="mt-1 text-xs leading-5 text-neutral-400">{status}</p>
            {preferences ? (
              <p className="mt-1 text-xs text-neutral-600">
                {preferences.activeSubscriptionCount} active device
                {preferences.activeSubscriptionCount === 1 ? "" : "s"}
              </p>
            ) : null}
          </div>
        </div>
        {registrationError ? (
          <p className="mt-3 text-xs text-rose-300">{registrationError}</p>
        ) : null}
        {subscriptionCheckError ? (
          <p className="mt-3 text-xs text-rose-300">
            This browser’s current push subscription could not be checked.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-xs text-rose-300">
            {error instanceof Error
              ? error.message
              : "Push subscription failed. Try again."}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button
            disabled={
              pending ||
              !pushSupported ||
              Boolean(registrationError) ||
              subscriptionCheckError ||
              permission === "denied" ||
              !configQuery.data?.enabled
            }
            onClick={() => turnOn.mutate()}
          >
            {stale || active ? "Reconnect" : "Turn on"}
          </Button>
          <Button
            variant="secondary"
            disabled={
              pending || (!subscription && !preferences?.webPushEnabled)
            }
            onClick={() => turnOff.mutate()}
          >
            Turn off
          </Button>
        </div>
      </div>
      <p className="text-xs leading-5 text-neutral-500">
        Browser alerts use generic preview text. Open Nexeloq to view CRM
        details securely.
      </p>
      <InstallAppButton />
    </div>
  );
}
