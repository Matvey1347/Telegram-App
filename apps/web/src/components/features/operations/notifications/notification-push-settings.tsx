"use client";

import type { OperationsNotificationPage, OperationsNotificationPreferences, OperationsNotificationPreferencesPatch } from "@telegram-system/shared";
import { useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { BellOff, BellRing, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { operationsNotificationsApi } from "@/lib/features/operations/operations-notifications-api";
import { operationsNotificationKeys } from "@/lib/query-keys";
import { InstallAppButton } from "./install-app-button";
import { NotificationCrmPreferences } from "./notification-crm-preferences";
import { useBrowserPushSubscription } from "./use-browser-push-subscription";
import { useNotificationSettingsCopy } from "./notification-settings-copy";

export { pushSubscriptionInput } from "./use-browser-push-subscription";

export function NotificationPushSettings({ workspaceId }: { workspaceId: string }) {
  return <PushSettingsSession key={workspaceId} workspaceId={workspaceId} />;
}

function PushSettingsSession({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const t = useNotificationSettingsCopy();
  const preferencesQuery = useQuery({
    queryKey: operationsNotificationKeys.preferences(workspaceId),
    queryFn: ({ signal }) => operationsNotificationsApi.preferences(signal),
    staleTime: 60_000,
  });
  const configQuery = useQuery({
    queryKey: operationsNotificationKeys.pushConfig(workspaceId),
    queryFn: ({ signal }) => operationsNotificationsApi.pushConfig(signal),
    staleTime: 60_000,
  });
  const reconcile = (value: OperationsNotificationPreferences) => {
    queryClient.setQueryData(operationsNotificationKeys.preferences(workspaceId), value);
  };
  const refreshNotificationReads = async (clearRows: boolean) => {
    const listKey = operationsNotificationKeys.list(workspaceId);
    await queryClient.cancelQueries({ queryKey: listKey, exact: true });
    // Visibility/privacy changes invalidate old cursors. Drop cached previews
    // before fetching; a test only retains page one while refreshing it.
    queryClient.setQueryData<InfiniteData<OperationsNotificationPage, string | null>>(listKey, (current) => current ? {
      ...current, pages: clearRows ? [] : current.pages.slice(0, 1), pageParams: clearRows ? [] : current.pageParams.slice(0, 1),
    } : undefined);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey, exact: true }),
      queryClient.invalidateQueries({ queryKey: operationsNotificationKeys.unread(workspaceId), exact: true }),
    ]);
  };
  const browser = useBrowserPushSubscription({ preferences: preferencesQuery.data, config: configQuery.data, reconcile });
  const preference = useMutation({
    mutationFn: (patch: OperationsNotificationPreferencesPatch) => operationsNotificationsApi.updatePreferences(patch),
    onSuccess: async (value) => { reconcile(value); await refreshNotificationReads(true); },
  });
  const test = useMutation({ mutationFn: operationsNotificationsApi.testPush, onSuccess: () => refreshNotificationReads(false) });
  const pending = browser.pending || preference.isPending;
  const preferences = preferencesQuery.data;

  if (preferencesQuery.isLoading || configQuery.isLoading) return <div role="status" className="flex items-center gap-2 text-sm text-neutral-400"><LoaderCircle size={16} className="animate-spin" aria-hidden />{t("notifications.settings.loading")}</div>;
  if (preferencesQuery.isError || configQuery.isError || !preferences) return (
    <div role="alert" className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-3">
      <p className="text-sm text-rose-200">{t("notifications.settings.loadError")}</p>
      <Button variant="secondary" className="mt-3" onClick={() => { void preferencesQuery.refetch(); void configQuery.refetch(); }}>{t("notifications.settings.retry")}</Button>
    </div>
  );
  return (
    <div className="space-y-5">
      <NotificationCrmPreferences preferences={preferences} pending={pending} onChange={(patch) => preference.mutate(patch)} />
      {preference.error ? <p role="alert" className="text-xs text-rose-300">{t("notifications.settings.saveError")}</p> : null}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4" aria-label={t("notifications.settings.browser")}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-neutral-400">{browser.active ? <BellRing size={18} aria-hidden /> : <BellOff size={18} aria-hidden />}</span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white">{t("notifications.settings.browser")}</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-400">{t(`notifications.settings.status.${browser.status}`)}</p>
            <p className="mt-1 text-xs text-neutral-400">{t("notifications.settings.devices", { count: preferences.activeSubscriptionCount })}</p>
          </div>
        </div>
        {browser.registrationError ? <p role="alert" className="mt-3 text-xs text-rose-300">{t("notifications.settings.workerError")}</p> : null}
        {browser.checkError ? <p role="alert" className="mt-3 text-xs text-rose-300">{t("notifications.settings.subscriptionError")}</p> : null}
        {browser.error ? <p role="alert" className="mt-3 text-xs text-rose-300">{t("notifications.settings.setupError")}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={pending || !browser.pushSupported || Boolean(browser.registrationError) || browser.checkError || browser.permission === "denied" || !configQuery.data?.enabled}
            onClick={() => browser.turnOn.mutate()}>{t(browser.stale || browser.active ? "notifications.settings.reconnect" : "notifications.settings.turnOn")}</Button>
          <Button variant="secondary" disabled={pending || !preferences.webPushEnabled}
            onClick={() => browser.turnOff.mutate()}>{t("notifications.settings.turnOff")}</Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-neutral-400">{t("notifications.settings.pushDescription")}</p>
      </section>
      <section className="space-y-2 border-t border-neutral-800 pt-4">
        <Button variant="secondary" className="!whitespace-normal text-left" disabled={pending || test.isPending || !preferences.webPushEnabled || !configQuery.data?.enabled}
          onClick={() => test.mutate()}>{t("notifications.settings.test")}</Button>
        <p className="text-xs leading-5 text-neutral-400">{t("notifications.settings.testDescription")}</p>
        {test.data ? <p role="status" className={`text-xs ${test.data.status === "sent" ? "text-emerald-300" : "text-amber-300"}`}>{t(`notifications.settings.test.${test.data.status}`, { count: test.data.delivered })}</p> : null}
        {test.error ? <p role="alert" className="text-xs text-rose-300">{t("notifications.settings.test.failed")}</p> : null}
      </section>
      <InstallAppButton />
    </div>
  );
}
