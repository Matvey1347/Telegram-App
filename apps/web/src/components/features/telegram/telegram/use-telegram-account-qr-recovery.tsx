"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { TelegramUserAccount } from "@/lib/api";
import { reconcileTelegramQrLoginSuccess } from "@/lib/features/telegram/telegram-query-invalidation";
import { telegramAccountKeys } from "@/lib/query-keys";
import { TelegramAccountQrModal } from "./telegram-account-qr-modal";

type ToastTone = "success" | "error" | "info" | "loading";

function selectedWorkspaceId() {
  return typeof window === "undefined"
    ? ""
    : window.localStorage.getItem("selected-workspace-id") || "";
}

export function useTelegramAccountQrRecovery({
  onNeedPassword,
  pushToast,
}: {
  onNeedPassword: (account: TelegramUserAccount) => void;
  pushToast: (message: string, tone?: ToastTone) => void;
}) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<{
    account: TelegramUserAccount;
    workspaceId: string;
  } | null>(null);
  const account = target?.account ?? null;

  useEffect(() => {
    if (!target) return;
    return queryClient.getQueryCache().subscribe(() => {
      if (selectedWorkspaceId() !== target.workspaceId) setTarget(null);
    });
  }, [queryClient, target]);

  const isCurrentWorkspace = () =>
    target != null && selectedWorkspaceId() === target.workspaceId;

  return {
    openQr: (nextAccount: TelegramUserAccount) =>
      setTarget({
        account: nextAccount,
        workspaceId: selectedWorkspaceId(),
      }),
    modal: (
      <TelegramAccountQrModal
        open={!!account}
        account={account}
        onClose={() => setTarget(null)}
        onConnected={(connectedAccount) => {
          if (!isCurrentWorkspace()) return;
          void reconcileTelegramQrLoginSuccess(queryClient, connectedAccount);
          setTarget(null);
          pushToast("Account connected and channel access synced.", "success");
        }}
        onNeedPassword={() => {
          if (account && isCurrentWorkspace()) {
            const pendingAccount = {
              ...account,
              status: "needs_password" as const,
              lastErrorMessage: undefined,
            };
            queryClient.setQueryData<TelegramUserAccount[]>(
              telegramAccountKeys.accounts(),
              (current = []) =>
                current.map((item) =>
                  item.id === pendingAccount.id ? pendingAccount : item,
                ),
            );
            onNeedPassword(pendingAccount);
          }
          setTarget(null);
        }}
      />
    ),
  };
}
