"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save, Settings2 } from "lucide-react";
import type { TelegramUserAccount } from "@/lib/api";
import { telegramUserAccountsApi } from "@/lib/api";
import { Button, Modal, MultiSelect } from "@/components/ui/primitives";
import { scheduledTaskKeys, telegramAccountKeys } from "@/lib/query-keys";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { useAppToast } from "@/providers/toast-provider";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";

export function CrmAccountSyncPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const { startOperation } = useAppToast();
  const accounts = useQuery({
    queryKey: telegramAccountKeys.accounts(),
    queryFn: telegramUserAccountsApi.list,
    staleTime: 60_000,
  });
  const connected = (accounts.data ?? []).filter(
    (account) => account.status === "connected",
  );
  const savedSelected = connected
    .filter((item) => item.crmSyncEnabled)
    .map((item) => item.id);
  const [selectedDraft, setSelectedDraft] = useState<string[] | null>(null);
  const selected = selectedDraft ?? savedSelected;
  const [open, setOpen] = useState(false);

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
        queryClient.invalidateQueries({ queryKey: scheduledTaskKeys.root }),
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
      const operation = startOperation({
        id: "telegram-crm-manual-sync",
        title: "Telegram CRM sync",
        message: "Preparing the selected Telegram accounts…",
        icon: { emoji: "🔄" },
        current: 0,
        total: selected.length,
      });
      try {
        for (const [index, accountId] of selected.entries()) {
          operation.update({
            message: `Syncing account ${index + 1} of ${selected.length}: importing dialogs, messages, and Telegram folder tags…`,
            current: index,
            total: selected.length,
          });
          results.push(await telegramCrmApi.initialSync(accountId));
        }
        const importedConversations = results.reduce(
          (total, result) => total + result.importedConversations,
          0,
        );
        const importedMessages = results.reduce(
          (total, result) => total + result.importedMessages,
          0,
        );
        operation.succeed({
          title: "Telegram CRM sync complete",
          message: `Synchronized ${selected.length} account${selected.length === 1 ? "" : "s"}: ${importedConversations} conversations, ${importedMessages} messages, and folder tags refreshed.`,
          progressSummary: { successful: selected.length, failed: 0 },
          icon: { emoji: "✅" },
        });
        return results;
      } catch (error) {
        operation.fail({
          title: "Telegram CRM sync failed",
          message: "Conversation sync failed. You can safely retry it.",
          details: error instanceof Error ? error.message : undefined,
          icon: { emoji: "⚠️" },
        });
        throw error;
      }
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
    <>
      <Button
        variant="secondary"
        className="h-11 rounded-xl border border-neutral-700 bg-neutral-900 px-4 hover:bg-neutral-800"
        onClick={() => {
          void accounts.refetch();
          setOpen(true);
        }}
        disabled={!canEdit}
      >
        <Settings2 size={17} />
        Manage sources
      </Button>
      <Modal
        open={open}
        onClose={() => {
          if (save.isPending || sync.isPending) return;
          setSelectedDraft(null);
          setOpen(false);
        }}
        title="Telegram CRM sources"
        size="sm"
        allowOverflow
      >
        <p className="mb-3 text-sm text-neutral-400">
          Selected MTProto accounts keep live updates enabled and sync
          automatically once a day. Manual imports run sequentially.
        </p>
        <div className="min-w-0">
          <MultiSelect
            value={selected}
            onChange={setSelectedDraft}
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
        <div className="mt-4 flex justify-end gap-2">
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
      </Modal>
    </>
  );
}
