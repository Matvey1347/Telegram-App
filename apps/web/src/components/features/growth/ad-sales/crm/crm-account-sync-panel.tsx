"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Settings2 } from "lucide-react";
import type { TelegramUserAccount } from "@/lib/api";
import { telegramUserAccountsApi } from "@/lib/api";
import { Button, Modal, MultiSelect } from "@/components/ui/primitives";
import { scheduledTaskKeys, telegramAccountKeys } from "@/lib/query-keys";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { useAppToast } from "@/providers/toast-provider";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { CrmTagMultiSelect } from "./crm-tag-multi-select";

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
  const settings = useQuery({
    queryKey: telegramCrmKeys.settings(),
    queryFn: () => telegramCrmApi.getSettings(),
    enabled: open,
  });
  const tags = useQuery({
    queryKey: telegramCrmKeys.tags(),
    queryFn: ({ signal }) => telegramCrmApi.listTags(signal),
    enabled: open,
  });
  const [purchaseTagDraft, setPurchaseTagDraft] = useState<string[] | null>(
    null,
  );
  const [importTagDraft, setImportTagDraft] = useState<string[] | null>(null);
  const importTagIds = importTagDraft ?? settings.data?.importTagIds ?? [];
  const purchaseTagId =
    purchaseTagDraft ??
    (settings.data?.purchaseTagId ? [settings.data.purchaseTagId] : []);

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
      if (purchaseTagDraft !== null) {
        await telegramCrmApi.updateSettings({
          ...(importTagDraft === null ? {} : { importTagIds }),
          purchaseTagId: purchaseTagId[0] ?? null,
        });
      } else if (importTagDraft !== null) {
        await telegramCrmApi.updateSettings({ importTagIds });
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
        queryClient.invalidateQueries({ queryKey: telegramCrmKeys.settings() }),
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
      if (hasUnsavedChanges) {
        await save.mutateAsync();
      }
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
  const hasUnsavedChanges =
    connected.some(
      (account) => account.crmSyncEnabled !== selected.includes(account.id),
    ) ||
    purchaseTagDraft !== null ||
    importTagDraft !== null;

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
          setPurchaseTagDraft(null);
          setImportTagDraft(null);
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
        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium text-white">
            Import tags
          </label>
          <p className="mb-2 text-xs text-neutral-500">
            Only contacts in these Telegram folders are shown as CRM clients and
            counted in analytics.
          </p>
          <CrmTagMultiSelect
            value={importTagIds}
            onChange={(value) => {
              setImportTagDraft(value);
              if (purchaseTagId[0] && !value.includes(purchaseTagId[0]))
                setPurchaseTagDraft([]);
            }}
            disabled={
              !canEdit ||
              settings.isLoading ||
              tags.isLoading ||
              save.isPending ||
              sync.isPending
            }
            tags={(tags.data ?? []).filter((tag) =>
              tag.systemKey?.startsWith("TELEGRAM_FOLDER:"),
            )}
            placeholder={
              tags.isLoading ? "Loading Telegram tags…" : "Select Telegram tags"
            }
            compactSelectedAfter={null}
          />
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-sm font-medium text-white">
            Purchase tag
          </label>
          <p className="mb-2 text-xs text-neutral-500">
            Applied automatically to buyers. A Telegram-folder tag also moves
            their Telegram chat into that folder.
          </p>
          <CrmTagMultiSelect
            value={purchaseTagId}
            onChange={(value) => setPurchaseTagDraft(value.slice(-1))}
            disabled={
              !canEdit ||
              settings.isLoading ||
              tags.isLoading ||
              save.isPending ||
              sync.isPending
            }
            tags={(tags.data ?? []).filter((tag) =>
              importTagIds.includes(tag.id),
            )}
            placeholder={tags.isLoading ? "Loading tags…" : "Select tags"}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            disabled={
              !canEdit ||
              save.isPending ||
              sync.isPending ||
              accounts.isLoading ||
              !selected.length
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
        {sync.error ? (
          <p className="mt-3 text-sm text-rose-300">
            Conversation sync failed. You can safely retry it.
          </p>
        ) : null}
      </Modal>
    </>
  );
}
