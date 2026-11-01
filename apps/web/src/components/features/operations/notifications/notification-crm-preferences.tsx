"use client";

import { CRM_NOTIFICATION_PREFERENCE_DEFAULTS, type OperationsNotificationPreferences, type OperationsNotificationPreferencesPatch } from "@telegram-system/shared";
import { ToggleRow } from "@/components/ui/primitives";
import { useNotificationSettingsCopy } from "./notification-settings-copy";

export function NotificationCrmPreferences({ preferences, pending, onChange }: {
  preferences: OperationsNotificationPreferences;
  pending: boolean;
  onChange: (patch: OperationsNotificationPreferencesPatch) => void;
}) {
  const t = useNotificationSettingsCopy();
  const master = preferences.crmNotificationsEnabled ?? CRM_NOTIFICATION_PREFERENCE_DEFAULTS.crmNotificationsEnabled;
  return (
    <section aria-label={t("notifications.settings.crm")} className="space-y-3">
      <div><h3 className="text-sm font-semibold text-white">{t("notifications.settings.crm")}</h3><p className="mt-1 text-xs leading-5 text-neutral-400">{t("notifications.settings.crmDescription")}</p></div>
      <ToggleRow checked={master} disabled={pending} label={t("notifications.settings.master")} description={t("notifications.settings.masterDescription")} onChange={(crmNotificationsEnabled) => onChange({ crmNotificationsEnabled })} activeTone="blue" />
      <ToggleRow checked={preferences.crmIncomingMessagesEnabled ?? CRM_NOTIFICATION_PREFERENCE_DEFAULTS.crmIncomingMessagesEnabled} disabled={pending || !master} label={t("notifications.settings.incoming")} description={t("notifications.settings.incomingDescription")} onChange={(crmIncomingMessagesEnabled) => onChange({ crmIncomingMessagesEnabled })} activeTone="blue" />
      <ToggleRow checked={preferences.crmFollowUpEnabled ?? CRM_NOTIFICATION_PREFERENCE_DEFAULTS.crmFollowUpEnabled} disabled={pending || !master} label={t("notifications.settings.followUp")} description={t("notifications.settings.followUpDescription")} onChange={(crmFollowUpEnabled) => onChange({ crmFollowUpEnabled })} activeTone="blue" />
      <ToggleRow checked={false} disabled label={t("notifications.settings.aiLeads")} description={t("notifications.settings.aiLeadsDescription")} onChange={() => undefined} />
      <ToggleRow checked={preferences.crmMessagePreviewEnabled ?? CRM_NOTIFICATION_PREFERENCE_DEFAULTS.crmMessagePreviewEnabled} disabled={pending || !master} label={t("notifications.settings.preview")} description={t("notifications.settings.previewDescription")} onChange={(crmMessagePreviewEnabled) => onChange({ crmMessagePreviewEnabled })} activeTone="blue" />
    </section>
  );
}
