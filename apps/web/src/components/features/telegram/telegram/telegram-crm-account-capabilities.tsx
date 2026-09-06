"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmAccountCapabilities } from "@telegram-system/shared";
import type { TelegramUserAccount } from "@/lib/api";
import { authApi } from "@/lib/api";
import { Modal, ToggleRow } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { authKeys, telegramAccountKeys } from "@/lib/query-keys";
import { crmPermissions } from "@/components/features/growth/ad-sales/crm/crm-permissions";

const capabilityRows = [
  {
    key: "mtprotoPublishingEnabled",
    label: "Publishing",
    detail: "Allow channel publishing with this user account.",
  },
] as const;

export function TelegramCrmAccountCapabilitiesModal({
  account,
  open,
  onClose,
}: {
  account: TelegramUserAccount;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
    enabled: open,
  });
  const permissions = crmPermissions(me.data?.workspace.access);
  const hasCrmView = permissions.canViewOwn || permissions.canViewAll;
  const capabilities = useQuery({
    queryKey: telegramCrmKeys.accountCapabilities(account.id),
    queryFn: ({ signal }) =>
      telegramCrmApi.getAccountCapabilities(account.id, signal),
    enabled: open && account.status === "connected" && hasCrmView,
    initialData: {
      accountId: account.id,
      crmSyncEnabled: account.crmSyncEnabled,
      crmSendEnabled: account.crmSendEnabled,
      mtprotoPublishingEnabled: account.mtprotoPublishingEnabled,
    },
  });
  const update = useMutation({
    mutationFn: (payload: Partial<Omit<CrmAccountCapabilities, "accountId">>) =>
      telegramCrmApi.updateAccountCapabilities(account.id, payload),
    onSuccess: (next) => {
      queryClient.setQueryData(
        telegramCrmKeys.accountCapabilities(account.id),
        next,
      );
      queryClient.setQueryData<TelegramUserAccount[]>(
        telegramAccountKeys.accounts(),
        (current = []) =>
          current.map((item) =>
            item.id === account.id ? { ...item, ...next } : item,
          ),
      );
    },
  });
  const values = capabilities.data;
  const editable = permissions.canEditAll;
  const pending = update.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Publishing · ${accountDisplayName(account)}`}
      size="md"
    >
      {account.status !== "connected" ? (
        <p className="rounded-lg border border-amber-800 bg-amber-950/25 p-3 text-sm text-amber-200">
          Reconnect this Telegram account before changing its capabilities.
        </p>
      ) : !hasCrmView && me.isSuccess ? (
        <p className="rounded-lg border border-amber-800 bg-amber-950/25 p-3 text-sm text-amber-200">
          CRM access is not enabled for your workspace role.
        </p>
      ) : (
        <div className="space-y-3">
          {capabilityRows.map((row) => (
            <ToggleRow
              key={row.key}
              checked={values[row.key]}
              label={row.label}
              description={row.detail}
              disabled={!editable || pending}
              onChange={(checked) => update.mutate({ [row.key]: checked })}
            />
          ))}
          {capabilities.error || update.error ? (
            <p className="text-sm text-rose-300">
              Account capability could not be saved. Try again.
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

function accountDisplayName(account: TelegramUserAccount) {
  const username = account.username?.replace(/^@+/, "");
  return username ? `@${username}` : account.label;
}
