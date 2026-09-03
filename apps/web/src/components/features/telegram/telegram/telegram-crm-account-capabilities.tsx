"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CrmAccountCapabilities,
  CrmWorkspaceSettings,
} from "@telegram-system/shared";
import type { TelegramUserAccount } from "@/lib/api";
import { authApi } from "@/lib/api";
import { Button, Modal, ToggleRow } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { authKeys, telegramAccountKeys } from "@/lib/query-keys";
import { crmPermissions } from "@/components/features/growth/ad-sales/crm/crm-permissions";
import { formatDateTime } from "@/lib/date-format";

const capabilityRows = [
  {
    key: "crmSyncEnabled",
    label: "CRM sync",
    detail: "Import dialogs and keep CRM conversations current.",
  },
  {
    key: "crmSendEnabled",
    label: "CRM sender",
    detail: "Allow manual replies from fixed CRM conversations.",
  },
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
  const settings = useQuery({
    queryKey: telegramCrmKeys.settings(),
    queryFn: ({ signal }) => telegramCrmApi.getSettings(signal),
    enabled: open && account.status === "connected" && hasCrmView,
  });
  const syncState = useQuery({
    queryKey: telegramCrmKeys.accountSyncState(account.id),
    queryFn: ({ signal }) =>
      telegramCrmApi.getAccountSyncState(account.id, signal),
    enabled: open && account.status === "connected" && hasCrmView,
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
      if (!next.crmSendEnabled) {
        queryClient.setQueryData<CrmWorkspaceSettings>(
          telegramCrmKeys.settings(),
          (current) =>
            current?.defaultCrmSenderAccountId === account.id
              ? { ...current, defaultCrmSenderAccountId: null }
              : current,
        );
      }
    },
  });
  const setDefault = useMutation({
    mutationFn: (selected: boolean) =>
      telegramCrmApi.updateSettings({
        defaultCrmSenderAccountId: selected ? account.id : null,
      }),
    onSuccess: (next) =>
      queryClient.setQueryData(telegramCrmKeys.settings(), next),
  });
  const initialSync = useMutation({
    mutationFn: () => telegramCrmApi.initialSync(account.id),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: telegramCrmKeys.accountSyncState(account.id),
      }),
  });
  const values = capabilities.data;
  const editable = permissions.canEditAll;
  const isDefault = settings.data?.defaultCrmSenderAccountId === account.id;
  const pending = update.isPending || setDefault.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`CRM & publishing · ${accountDisplayName(account)}`}
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
          <p className="text-sm text-neutral-400">
            CRM history import does not create Contacts or enable customer
            automation.
          </p>
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
            checked={isDefault}
            label="Default CRM sender"
            description="Use this account as the initial sender for new CRM conversations."
            disabled={
              !editable ||
              !values.crmSendEnabled ||
              pending ||
              settings.isLoading
            }
            activeTone="blue"
            onChange={(checked) => setDefault.mutate(checked)}
          />
          {values.crmSyncEnabled ? (
            <div className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">
                  Initial CRM import
                </h3>
                <p className="mt-1 text-sm text-neutral-400">
                  {initialImportLabel(syncState.data?.initialImportStatus)}
                  {syncState.data?.lastMeaningfulSyncAt
                    ? ` · last data ${formatDateTime(syncState.data.lastMeaningfulSyncAt)}`
                    : ""}
                </p>
              </div>
              {syncState.data?.initialImportStatus !== "COMPLETED" ? (
                <Button
                  variant="secondary"
                  disabled={
                    !editable ||
                    initialSync.isPending ||
                    syncState.data?.initialImportStatus === "IN_PROGRESS"
                  }
                  onClick={() => initialSync.mutate()}
                >
                  {syncState.data?.initialImportStatus === "FAILED"
                    ? "Retry import"
                    : initialSync.isPending
                      ? "Starting…"
                      : "Start import"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {capabilities.error ||
          settings.error ||
          syncState.error ||
          update.error ||
          setDefault.error ||
          initialSync.error ? (
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

function initialImportLabel(status?: string) {
  if (status === "COMPLETED") return "Ready";
  if (status === "IN_PROGRESS") return "Syncing";
  if (status === "FAILED") return "Failed";
  return "Not started";
}
