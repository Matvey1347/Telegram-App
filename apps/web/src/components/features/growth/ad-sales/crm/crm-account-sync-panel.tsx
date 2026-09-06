"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save } from "lucide-react";
import type { TelegramUserAccount } from "@/lib/api";
import { telegramUserAccountsApi } from "@/lib/api";
import { Button, MultiSelect } from "@/components/ui/primitives";
import { telegramAccountKeys } from "@/lib/query-keys";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";

export function CrmAccountSyncPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const accounts = useQuery({
    queryKey: telegramAccountKeys.accounts(),
    queryFn: telegramUserAccountsApi.list,
    staleTime: 60_000,
  });
  const connected = (accounts.data ?? []).filter(
    (account) => account.status === "connected",
  );
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    setSelected(
      connected.filter((item) => item.crmSyncEnabled).map((item) => item.id),
    );
  }, [accounts.data]);

  const save = useMutation({
    mutationFn: async () => {
      const selectedSet = new Set(selected);
      const changed = connected.filter(
        (account) => account.crmSyncEnabled !== selectedSet.has(account.id),
      );
      for (const account of changed) {
        await telegramCrmApi.updateAccountCapabilities(account.id, {
          crmSyncEnabled: selectedSet.has(account.id),
        });
      }
      return { changed };
    },
    onSuccess: async () => {
      queryClient.setQueryData<TelegramUserAccount[]>(
        telegramAccountKeys.accounts(),
        (current = []) =>
          current.map((account) => ({
            ...account,
            crmSyncEnabled: selected.includes(account.id),
          })),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.contactLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.inboxLists(),
        }),
        queryClient.invalidateQueries({ queryKey: telegramCrmKeys.unread() }),
      ]);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramAccountKeys.accounts(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.contactLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.inboxLists(),
        }),
        queryClient.invalidateQueries({ queryKey: telegramCrmKeys.unread() }),
      ]);
    },
  });
  const sync = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const accountId of selected) {
        results.push(await telegramCrmApi.initialSync(accountId));
      }
      return results;
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.contactLists(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramCrmKeys.inboxLists(),
        }),
        queryClient.invalidateQueries({ queryKey: telegramCrmKeys.unread() }),
      ]);
    },
  });
  const hasUnsavedChanges = connected.some(
    (account) => account.crmSyncEnabled !== selected.includes(account.id),
  );

  return (
    <section className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900/55 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-white">
            Telegram CRM sources
          </h2>
          <p className="mb-2 mt-1 text-xs text-neutral-500">
            Select one or more connected MTProto accounts. Imports run
            sequentially and live updates stay enabled for the selected
            accounts.
          </p>
          <MultiSelect
            value={selected}
            onChange={setSelected}
            disabled={
              !canEdit || accounts.isLoading || save.isPending || sync.isPending
            }
            options={connected.map((account) => ({
              value: account.id,
              label: account.username
                ? `@${account.username.replace(/^@+/, "")}`
                : account.label,
              icon: (
                <TelegramEntityAvatar
                  imageUrl={account.photoUrl}
                  kind="mtproto"
                  size="xs"
                  alt=""
                />
              ),
            }))}
            placeholder={
              accounts.isLoading
                ? "Loading accounts…"
                : "Select MTProto accounts"
            }
            allSelectedLabel="All connected accounts"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            disabled={
              !canEdit ||
              save.isPending ||
              sync.isPending ||
              accounts.isLoading ||
              !hasUnsavedChanges
            }
            onClick={() => save.mutate()}
          >
            <Save size={16} />
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            disabled={
              !canEdit ||
              save.isPending ||
              sync.isPending ||
              accounts.isLoading ||
              !selected.length ||
              hasUnsavedChanges
            }
            onClick={() => sync.mutate()}
          >
            <RefreshCw
              size={16}
              className={sync.isPending ? "animate-spin" : ""}
            />
            {sync.isPending ? "Syncing…" : "Sync"}
          </Button>
        </div>
      </div>
      {!accounts.isLoading && !connected.length ? (
        <p className="mt-3 text-sm text-amber-300">
          Connect an MTProto account in Telegram resources first.
        </p>
      ) : null}
      {save.error ? (
        <p className="mt-3 text-sm text-rose-300">
          CRM sources could not be saved.
        </p>
      ) : null}
      {hasUnsavedChanges ? (
        <p className="mt-3 text-xs text-amber-300">
          Save the selected sources before syncing.
        </p>
      ) : null}
      {sync.error ? (
        <p className="mt-3 text-sm text-rose-300">
          Conversation sync failed. You can safely retry it.
        </p>
      ) : null}
    </section>
  );
}
