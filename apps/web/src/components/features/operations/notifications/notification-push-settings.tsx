"use client";

import type {
  OperationsNotificationPage,
  OperationsNotificationPreferences,
  OperationsNotificationPreferencesPatch,
} from "@telegram-system/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useState } from "react";
import { BellOff, BellRing, LoaderCircle } from "lucide-react";
import { Button, CustomSelect, ToggleRow } from "@/components/ui/primitives";
import { operationsNotificationsApi } from "@/lib/features/operations/operations-notifications-api";
import { operationsNotificationKeys } from "@/lib/query-keys";
import { InstallAppButton } from "./install-app-button";
import { NotificationCrmPreferences } from "./notification-crm-preferences";
import { useBrowserPushSubscription } from "./use-browser-push-subscription";
import { useNotificationSettingsCopy } from "./notification-settings-copy";
import { telegramChannelsApi } from "@/lib/api";

const autopilotEvents = [
  "LOW_SCHEDULE_COVERAGE",
  "CRITICAL_DRAFT_STOCK",
  "GENERATION_OR_IMAGE_FAILURE",
  "AI_API_OR_BUDGET_FAILURE",
  "PLANNING_OR_PUBLICATION_FAILURE",
  "WEEKLY_REPLENISHMENT",
  "WEEKLY_REPORT",
] as const;
const autopilotEventLabels = {
  LOW_SCHEDULE_COVERAGE:
    "notifications.settings.autopilotEvents.LOW_SCHEDULE_COVERAGE",
  CRITICAL_DRAFT_STOCK:
    "notifications.settings.autopilotEvents.CRITICAL_DRAFT_STOCK",
  GENERATION_OR_IMAGE_FAILURE:
    "notifications.settings.autopilotEvents.GENERATION_OR_IMAGE_FAILURE",
  AI_API_OR_BUDGET_FAILURE:
    "notifications.settings.autopilotEvents.AI_API_OR_BUDGET_FAILURE",
  PLANNING_OR_PUBLICATION_FAILURE:
    "notifications.settings.autopilotEvents.PLANNING_OR_PUBLICATION_FAILURE",
  WEEKLY_REPLENISHMENT:
    "notifications.settings.autopilotEvents.WEEKLY_REPLENISHMENT",
  WEEKLY_REPORT: "notifications.settings.autopilotEvents.WEEKLY_REPORT",
} as const;
type DeliveryPrefs = { telegramBot: boolean; pwaPush: boolean; email: boolean };
type SavedDeliveryPrefs = DeliveryPrefs & {
  eventKey: string;
  channelScopeKey: string;
};

export { pushSubscriptionInput } from "./use-browser-push-subscription";

const NOTIFICATION_SETTINGS_STALE_TIME = 4 * 60_000;

export function NotificationPushSettings({
  workspaceId,
}: {
  workspaceId: string;
}) {
  return <PushSettingsSession key={workspaceId} workspaceId={workspaceId} />;
}

function PushSettingsSession({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const t = useNotificationSettingsCopy();
  const preferencesQuery = useQuery({
    queryKey: operationsNotificationKeys.preferences(workspaceId),
    queryFn: ({ signal }) => operationsNotificationsApi.preferences(signal),
    staleTime: NOTIFICATION_SETTINGS_STALE_TIME,
  });
  const configQuery = useQuery({
    queryKey: operationsNotificationKeys.pushConfig(workspaceId),
    queryFn: ({ signal }) => operationsNotificationsApi.pushConfig(signal),
    staleTime: NOTIFICATION_SETTINGS_STALE_TIME,
  });
  const reconcile = (value: OperationsNotificationPreferences) => {
    queryClient.setQueryData(
      operationsNotificationKeys.preferences(workspaceId),
      value,
    );
  };
  const refreshNotificationReads = async (clearRows: boolean) => {
    const listKey = operationsNotificationKeys.list(workspaceId);
    await queryClient.cancelQueries({ queryKey: listKey, exact: true });
    // Visibility/privacy changes invalidate old cursors. Drop cached previews
    // before fetching; a test only retains page one while refreshing it.
    queryClient.setQueryData<
      InfiniteData<OperationsNotificationPage, string | null>
    >(listKey, (current) =>
      current
        ? {
            ...current,
            pages: clearRows ? [] : current.pages.slice(0, 1),
            pageParams: clearRows ? [] : current.pageParams.slice(0, 1),
          }
        : undefined,
    );
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey, exact: true }),
      queryClient.invalidateQueries({
        queryKey: operationsNotificationKeys.unread(workspaceId),
        exact: true,
      }),
    ]);
  };
  const browser = useBrowserPushSubscription({
    preferences: preferencesQuery.data,
    config: configQuery.data,
    reconcile,
  });
  const preference = useMutation({
    mutationFn: (patch: OperationsNotificationPreferencesPatch) =>
      operationsNotificationsApi.updatePreferences(patch),
    onSuccess: async (value) => {
      reconcile(value);
      await refreshNotificationReads(true);
    },
  });
  const test = useMutation({
    mutationFn: operationsNotificationsApi.testPush,
    onSuccess: () => refreshNotificationReads(false),
  });
  const pending = browser.pending || preference.isPending;
  const preferences = preferencesQuery.data;

  if (preferencesQuery.isLoading || configQuery.isLoading)
    return (
      <div
        role="status"
        className="flex items-center gap-2 text-sm text-neutral-400"
      >
        <LoaderCircle size={16} className="animate-spin" aria-hidden />
        {t("notifications.settings.loading")}
      </div>
    );
  if (preferencesQuery.isError || configQuery.isError || !preferences)
    return (
      <div
        role="alert"
        className="rounded-lg border border-rose-900/60 bg-rose-950/20 p-3"
      >
        <p className="text-sm text-rose-200">
          {t("notifications.settings.loadError")}
        </p>
        <Button
          variant="secondary"
          className="mt-3"
          onClick={() => {
            void preferencesQuery.refetch();
            void configQuery.refetch();
          }}
        >
          {t("notifications.settings.retry")}
        </Button>
      </div>
    );
  return (
    <div className="space-y-5">
      <NotificationCrmPreferences
        preferences={preferences}
        pending={pending}
        onChange={(patch) => preference.mutate(patch)}
      />
      <AutopilotDeliveryPreferences workspaceId={workspaceId} />
      <section
        aria-label={t("notifications.settings.channelReminders")}
        className="space-y-3"
      >
        <div>
          <h3 className="text-sm font-semibold text-white">
            {t("notifications.settings.channelReminders")}
          </h3>
          <p className="mt-1 text-xs leading-5 text-neutral-400">
            {t("notifications.settings.channelRemindersDescription")}
          </p>
        </div>
        <ToggleRow
          checked={preferences.channelRemindersPushEnabled ?? false}
          disabled={pending}
          label={t("notifications.settings.channelRemindersPush")}
          description={t(
            "notifications.settings.channelRemindersPushDescription",
          )}
          onChange={(channelRemindersPushEnabled) =>
            preference.mutate({ channelRemindersPushEnabled })
          }
          activeTone="blue"
        />
        <ToggleRow
          checked={preferences.channelRemindersTelegramEnabled ?? false}
          disabled={pending}
          label={t("notifications.settings.channelRemindersTelegram")}
          description={t(
            "notifications.settings.channelRemindersTelegramDescription",
          )}
          onChange={(channelRemindersTelegramEnabled) =>
            preference.mutate({ channelRemindersTelegramEnabled })
          }
          activeTone="blue"
        />
      </section>
      {preference.error ? (
        <p role="alert" className="text-xs text-rose-300">
          {t("notifications.settings.saveError")}
        </p>
      ) : null}
      <section
        className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
        aria-label={t("notifications.settings.browser")}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-neutral-400">
            {browser.active ? (
              <BellRing size={18} aria-hidden />
            ) : (
              <BellOff size={18} aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-white">
              {t("notifications.settings.browser")}
            </h3>
            <p className="mt-1 text-xs leading-5 text-neutral-400">
              {t(`notifications.settings.status.${browser.status}`)}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {t("notifications.settings.devices", {
                count: preferences.activeSubscriptionCount,
              })}
            </p>
          </div>
        </div>
        {browser.registrationError ? (
          <p role="alert" className="mt-3 text-xs text-rose-300">
            {t("notifications.settings.workerError")}
          </p>
        ) : null}
        {browser.checkError ? (
          <p role="alert" className="mt-3 text-xs text-rose-300">
            {t("notifications.settings.subscriptionError")}
          </p>
        ) : null}
        {browser.error ? (
          <p role="alert" className="mt-3 text-xs text-rose-300">
            {t("notifications.settings.setupError")}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={
              pending ||
              !browser.pushSupported ||
              Boolean(browser.registrationError) ||
              browser.checkError ||
              browser.permission === "denied" ||
              !configQuery.data?.enabled
            }
            onClick={() => browser.turnOn.mutate()}
          >
            {t(
              browser.stale || browser.active
                ? "notifications.settings.reconnect"
                : "notifications.settings.turnOn",
            )}
          </Button>
          <Button
            variant="secondary"
            disabled={pending || !preferences.webPushEnabled}
            onClick={() => browser.turnOff.mutate()}
          >
            {t("notifications.settings.turnOff")}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-neutral-400">
          {t("notifications.settings.pushDescription")}
        </p>
      </section>
      <section className="space-y-2 border-t border-neutral-800 pt-4">
        <Button
          variant="secondary"
          className="!whitespace-normal text-left"
          disabled={
            pending ||
            test.isPending ||
            !preferences.webPushEnabled ||
            !configQuery.data?.enabled
          }
          onClick={() => test.mutate()}
        >
          {t("notifications.settings.test")}
        </Button>
        <p className="text-xs leading-5 text-neutral-400">
          {t("notifications.settings.testDescription")}
        </p>
        {test.data ? (
          <p
            role="status"
            className={`text-xs ${test.data.status === "sent" ? "text-emerald-300" : "text-amber-300"}`}
          >
            {t(`notifications.settings.test.${test.data.status}`, {
              count: test.data.delivered,
            })}
          </p>
        ) : null}
        {test.error ? (
          <p role="alert" className="text-xs text-rose-300">
            {t("notifications.settings.test.failed")}
          </p>
        ) : null}
      </section>
      <InstallAppButton />
    </div>
  );
}

function AutopilotDeliveryPreferences({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const t = useNotificationSettingsCopy();
  const client = useQueryClient();
  const [channelId, setChannelId] = useState("");
  const channels = useQuery({
    queryKey: ["autopilot-notification-channels", workspaceId],
    queryFn: () => telegramChannelsApi.select({}),
  });
  const key = [
    "ai-posting-notification-preferences",
    workspaceId,
    channelId || "*",
  ] as const;
  const saved = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      operationsNotificationsApi.autopilotPreferences(
        channelId || undefined,
        signal,
      ),
  });
  const update = useMutation({
    mutationFn: operationsNotificationsApi.updateAutopilotPreference,
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
  const resolve = (eventKey: string): DeliveryPrefs => {
    const rows = (saved.data ?? []) as SavedDeliveryPrefs[];
    const exact = channelId
      ? rows.find(
          (row) =>
            row.eventKey === eventKey && row.channelScopeKey === channelId,
        )
      : undefined;
    const globalEvent = rows.find(
      (row) => row.eventKey === eventKey && row.channelScopeKey === "*",
    );
    const global = rows.find(
      (row) => row.eventKey === "*" && row.channelScopeKey === "*",
    );
    return (
      exact ??
      globalEvent ??
      global ?? { telegramBot: false, pwaPush: true, email: false }
    );
  };
  const save = (
    eventKey: string,
    field: keyof DeliveryPrefs,
    value: boolean,
  ) => {
    const next = { ...resolve(eventKey), [field]: value };
    update.mutate({ eventKey, channelId: channelId || undefined, ...next });
  };
  return (
    <section className="space-y-3 border-t border-neutral-800 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-white">
          {t("notifications.settings.autopilotTitle")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-neutral-400">
          {t("notifications.settings.autopilotDescription")}
        </p>
      </div>
      <div className="max-w-sm">
        <CustomSelect
          value={channelId}
          onChange={setChannelId}
          placeholder={t("notifications.settings.allChannels")}
          options={(channels.data ?? []).map((channel) => ({
            value: channel.id,
            label: channel.title,
          }))}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead>
            <tr className="text-neutral-400">
              <th className="py-2">
                {t("notifications.settings.autopilotEvent")}
              </th>
              <th>{t("notifications.settings.channelRemindersTelegram")}</th>
              <th>{t("notifications.settings.browser")}</th>
              <th>{t("notifications.settings.email")}</th>
            </tr>
          </thead>
          <tbody>
            {["*", ...autopilotEvents].map((eventKey) => {
              const value = resolve(eventKey);
              const label =
                eventKey === "*"
                  ? t("notifications.settings.autopilotAllEvents")
                  : t(
                      autopilotEventLabels[
                        eventKey as keyof typeof autopilotEventLabels
                      ],
                    );
              return (
                <tr key={eventKey} className="border-t border-neutral-800">
                  <th className="py-2 font-medium text-neutral-200">{label}</th>
                  {(["telegramBot", "pwaPush", "email"] as const).map(
                    (field) => (
                      <td key={field} className="py-2">
                        <input
                          aria-label={`${eventKey} ${field}`}
                          type="checkbox"
                          checked={value[field]}
                          disabled={update.isPending || saved.isLoading}
                          onChange={(event) =>
                            save(eventKey, field, event.target.checked)
                          }
                        />
                      </td>
                    ),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {saved.isError || update.isError ? (
        <p role="alert" className="text-xs text-rose-300">
          {t("notifications.settings.autopilotSaveError")}
        </p>
      ) : null}
    </section>
  );
}
