"use client";

import { Card } from "@/components/ui/primitives";
import { NotificationPushSettings } from "./notification-push-settings";
import { useNotificationSettingsCopy } from "./notification-settings-copy";

export function NotificationSettingsSection({ workspaceId }: { workspaceId: string }) {
  const t = useNotificationSettingsCopy();
  return <Card>
    <h2 className="mb-4 text-lg font-semibold text-white">{t("notifications.settings.title")}</h2>
    <NotificationPushSettings key={workspaceId} workspaceId={workspaceId} />
  </Card>;
}
