"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmAccountCapabilities } from "@telegram-system/shared";
import { authApi, type TelegramUserAccount } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { authKeys, telegramAccountKeys } from "@/lib/query-keys";
import { crmPermissions } from "@/components/features/growth/ad-sales/crm/crm-permissions";
import { formatDateTime } from "@/lib/date-format";

const capabilityRows = [
  { key: "crmSyncEnabled", label: "CRM Sync", detail: "Import dialogs and keep CRM conversations current." },
  { key: "crmSendEnabled", label: "CRM Send", detail: "Allow manual replies from fixed CRM conversations." },
  { key: "mtprotoPublishingEnabled", label: "MTProto Publishing", detail: "Allow channel publishing with this user account." },
] as const;

export function TelegramCrmAccountCapabilities({ account }: { account: TelegramUserAccount }) {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: authKeys.me(), queryFn: authApi.me, staleTime: 5 * 60_000 });
  const permissions = crmPermissions(me.data?.workspace.access);
  const hasCrmView = permissions.canViewOwn || permissions.canViewAll;
  const capabilities = useQuery({
    queryKey: telegramCrmKeys.accountCapabilities(account.id),
    queryFn: ({ signal }) => telegramCrmApi.getAccountCapabilities(account.id, signal),
    enabled: account.status === "connected" && hasCrmView,
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
    enabled: account.status === "connected" && hasCrmView,
  });
  const syncState = useQuery({
    queryKey: telegramCrmKeys.accountSyncState(account.id),
    queryFn: ({ signal }) => telegramCrmApi.getAccountSyncState(account.id, signal),
    enabled: account.status === "connected" && hasCrmView,
  });
  const update = useMutation({
    mutationFn: (payload: Partial<Omit<CrmAccountCapabilities, "accountId">>) =>
      telegramCrmApi.updateAccountCapabilities(account.id, payload),
    onSuccess: (next) => {
      queryClient.setQueryData(telegramCrmKeys.accountCapabilities(account.id), next);
      queryClient.setQueryData<TelegramUserAccount[]>(telegramAccountKeys.accounts(), (current = []) =>
        current.map((item) => item.id === account.id ? { ...item, ...next } : item),
      );
    },
  });
  const setDefault = useMutation({
    mutationFn: (selected: boolean) =>
      telegramCrmApi.updateSettings({ defaultCrmSenderAccountId: selected ? account.id : null }),
    onSuccess: (next) => queryClient.setQueryData(telegramCrmKeys.settings(), next),
  });
  const initialSync = useMutation({
    mutationFn: () => telegramCrmApi.initialSync(account.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: telegramCrmKeys.accountSyncState(account.id) }),
  });
  if (account.status !== "connected" || !hasCrmView) return null;
  const values = capabilities.data;
  const editable = permissions.canEditAll;
  const isDefault = settings.data?.defaultCrmSenderAccountId === account.id;
  return (
    <section className="mt-4 space-y-2 border-t border-neutral-800 pt-4" aria-label="Account capabilities">
      <div><h2 className="font-medium text-white">CRM &amp; publishing capabilities</h2><p className="mt-1 text-xs text-neutral-500">CRM history import does not create Contacts or enable customer automation.</p></div>
      {capabilityRows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
          <div><h3 className="text-sm font-medium text-white">{row.label}</h3><p className="mt-0.5 text-xs text-neutral-500">{row.detail}</p></div>
          <Button variant="secondary" disabled={!editable || update.isPending} aria-pressed={values[row.key]} onClick={() => update.mutate({ [row.key]: !values[row.key] })}>{values[row.key] ? "On" : "Off"}</Button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
        <div><h3 className="text-sm font-medium text-white">Default sender</h3><p className="mt-0.5 text-xs text-neutral-500">Used only as the initial account choice for a new CRM conversation.</p></div>
        <Button variant="secondary" disabled={!editable || !values.crmSendEnabled || setDefault.isPending} aria-pressed={isDefault} onClick={() => setDefault.mutate(!isDefault)}>{isDefault ? "Default" : "Set default"}</Button>
      </div>
      {values.crmSyncEnabled ? <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3"><div><h3 className="text-sm font-medium text-white">Initial CRM import</h3><p className="mt-0.5 text-xs text-neutral-500">{syncState.data?.initialImportStatus === "COMPLETED" ? "Ready" : syncState.data?.initialImportStatus === "IN_PROGRESS" ? "Syncing" : syncState.data?.initialImportStatus === "FAILED" ? "Failed" : "Not started"}{syncState.data?.lastMeaningfulSyncAt ? ` · last data ${formatDateTime(syncState.data.lastMeaningfulSyncAt)}` : ""}</p></div>{syncState.data?.initialImportStatus !== "COMPLETED" ? <Button variant="secondary" disabled={!editable || initialSync.isPending || syncState.data?.initialImportStatus === "IN_PROGRESS"} onClick={() => initialSync.mutate()}>{syncState.data?.initialImportStatus === "FAILED" ? "Retry import" : initialSync.isPending ? "Starting…" : "Start import"}</Button> : null}</div> : null}
      {update.error || setDefault.error || initialSync.error ? <p className="text-xs text-rose-300">CRM account setting could not be saved.</p> : null}
    </section>
  );
}
