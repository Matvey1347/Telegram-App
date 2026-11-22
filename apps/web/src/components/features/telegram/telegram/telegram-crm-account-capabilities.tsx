"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmAccountCapabilities } from "@telegram-system/shared";
import type { TelegramUserAccount } from "@/lib/api";
import { authApi, telegramUserAccountsApi } from "@/lib/api";
import { Modal, ToggleRow } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { authKeys, telegramAccountKeys, telegramChannelKeys } from "@/lib/query-keys";
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
      isPreferredInviteLinkAccount: account.isPreferredInviteLinkAccount,
    },
  });
  const update = useMutation({
    mutationFn: (payload: Partial<Omit<CrmAccountCapabilities, "accountId">>) =>
      telegramCrmApi.updateAccountCapabilities(account.id, payload),
    onSuccess: (next, changes) => {
      queryClient.setQueryData(
        telegramCrmKeys.accountCapabilities(account.id),
        next,
      );
      queryClient.setQueryData<TelegramUserAccount[]>(
        telegramAccountKeys.accounts(),
        (current = []) =>
          current.map((item) =>
            item.id === account.id
              ? { ...item, ...next }
              : changes.isPreferredInviteLinkAccount === true
                ? { ...item, isPreferredInviteLinkAccount: false }
                : item,
          ),
      );
      if (changes.isPreferredInviteLinkAccount !== undefined) {
        if (next.isPreferredInviteLinkAccount) {
          const accounts = queryClient.getQueryData<TelegramUserAccount[]>(telegramAccountKeys.accounts()) ?? [];
          for (const item of accounts) {
            if (item.id !== account.id) queryClient.setQueryData<CrmAccountCapabilities>(
              telegramCrmKeys.accountCapabilities(item.id),
              (previous) => previous ? { ...previous, isPreferredInviteLinkAccount: false } : previous,
            );
          }
        }
        void queryClient.invalidateQueries({ queryKey: telegramChannelKeys.sources() });
      }
    },
  });
  const priorityUpdate = useMutation({
    mutationFn: (isPriorityPublisher: boolean) =>
      telegramUserAccountsApi.update(account.id, { isPriorityPublisher }),
    onSuccess: (next) => {
      queryClient.setQueryData<TelegramUserAccount[]>(
        telegramAccountKeys.accounts(),
        (current = []) =>
          current.map((item) => ({
            ...item,
            isPriorityPublisher:
              item.id === account.id
                ? Boolean(next.isPriorityPublisher)
                : false,
          })),
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
      title={`Settings · ${accountDisplayName(account)}`}
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
          <ToggleRow
            checked={Boolean(account.isPriorityPublisher)}
            label="Priority publishing account"
            description="Use this account first for channel publishing. Other eligible accounts remain available as fallback."
            disabled={
              !editable ||
              pending ||
              priorityUpdate.isPending ||
              !account.mtprotoPublishingEnabled
            }
            onChange={(checked) => priorityUpdate.mutate(checked)}
          />
          <ToggleRow
            checked={Boolean(values.isPreferredInviteLinkAccount)}
            label="Default account for invite links"
            disabled={!editable || pending || !account.isActive}
            onChange={(checked) => update.mutate({ isPreferredInviteLinkAccount: checked })}
          />
          {capabilities.error || update.error || priorityUpdate.error ? (
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
