"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { telegramSystemBotApi } from "@/lib/api";
import { telegramSystemBotKeys } from "@/lib/query-keys";

// Only an explicitly started, unexpired link is watched; idle pages make no requests.
export function useNotificationLinkWatch(workspaceId: string, kind: "group" | "account", link: { token: string; expiresAt: string } | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (!workspaceId || !link) return;
    let stopped = false, running = false, attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (stopped || running || Date.now() >= Date.parse(link.expiresAt)) return;
      if (document.visibilityState !== "visible") return;
      running = true;
      try {
        const status = await client.fetchQuery({
          queryKey: kind === "group" ? telegramSystemBotKeys.notificationGroup(workspaceId) : telegramSystemBotKeys.notificationAccount(workspaceId),
          queryFn: async (): Promise<{ connected: boolean; linkPending?: boolean }> => kind === "group" ? telegramSystemBotApi.notificationGroup() : telegramSystemBotApi.notificationAccount(),
          staleTime: 0,
        });
        if (status.connected && status.linkPending === false) { stopped = true; return; }
      } catch { /* Retry while the link remains active. */ }
      finally { running = false; }
      if (!stopped) timer = setTimeout(refresh, attempts++ < 15 ? 4_000 : 15_000);
    };
    const visible = () => { if (document.visibilityState === "visible") { if (timer) clearTimeout(timer); void refresh(); } };
    document.addEventListener("visibilitychange", visible);
    timer = setTimeout(refresh, 4_000);
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [client, workspaceId, kind, link]);
}
