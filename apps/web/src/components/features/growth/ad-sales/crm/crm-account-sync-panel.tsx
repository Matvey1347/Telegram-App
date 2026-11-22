"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, RefreshCw } from "lucide-react";
import type { TelegramUserAccount } from "@/lib/api";
import { telegramUserAccountsApi } from "@/lib/api";
import { Button, MultiSelect, Tooltip } from "@/components/ui/primitives";
import { scheduledTaskKeys, telegramAccountKeys } from "@/lib/query-keys";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";
import { useAppToast } from "@/providers/toast-provider";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { CrmTagMultiSelect } from "./crm-tag-multi-select";
import { useOptionalI18n } from "@/providers/i18n-provider";

export function CrmAccountSyncPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const i18n = useOptionalI18n();
  const { startOperation } = useAppToast();
  const accounts = useQuery({
    queryKey: telegramAccountKeys.accounts(),
    queryFn: telegramUserAccountsApi.list,
    staleTime: 24 * 60 * 60_000,
  });
  const connected = (accounts.data ?? []).filter(
    (account) => account.status === "connected",
  );
  const savedSelected = connected
    .filter((item) => item.crmSyncEnabled)
    .map((item) => item.id);
  const [selectedDraft, setSelectedDraft] = useState<string[] | null>(null);
  const selected = selectedDraft ?? savedSelected;
  const settings = useQuery({
    queryKey: telegramCrmKeys.settings(),
    queryFn: () => telegramCrmApi.getSettings(),
  });
  const tags = useQuery({
    queryKey: telegramCrmKeys.tags(),
    queryFn: ({ signal }) => telegramCrmApi.listTags(signal),
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
      setSelectedDraft(null);
      setPurchaseTagDraft(null);
      setImportTagDraft(null);
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
    <section className="rounded-2xl border border-neutral-800 bg-neutral-950/60 p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {i18n?.t("crm.settings.title") ?? "CRM source settings"}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-neutral-400">
            {i18n?.t("crm.settings.sync_help") ??
              "Selected MTProto accounts keep live updates enabled and sync automatically once a day. Manual imports run sequentially."}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void accounts.refetch()}
          disabled={accounts.isFetching}
        >
          <RefreshCw
            size={16}
            className={accounts.isFetching ? "animate-spin" : ""}
          />
          {i18n?.t("crm.settings.refresh_accounts") ?? "Refresh accounts"}
        </Button>
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0">
          <label className="mb-2 block text-sm font-medium text-white">
            {i18n?.t("crm.settings.accounts") ?? "MTProto accounts"}
          </label>
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
                ? (i18n?.t("crm.settings.loading_accounts") ??
                  "Loading accounts…")
                : (i18n?.t("crm.settings.select_accounts") ??
                  "Select MTProto accounts")
            }
            allSelectedLabel={
              i18n?.t("crm.settings.all_accounts") ?? "All connected accounts"
            }
          />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-white">
            <span>{i18n?.t("crm.settings.import_tags") ?? "Import tags"}</span>
            <Tooltip
              content={
                i18n?.t("crm.settings.import_tags_help") ??
                "Only contacts in these Telegram folders are shown as CRM clients and counted in analytics."
              }
              side="top"
              align="left"
            >
              <button
                type="button"
                aria-label={`${i18n?.t("crm.settings.import_tags") ?? "Import tags"} info`}
                className="inline-flex text-neutral-500 transition hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <CircleHelp size={15} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
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
              tags.isLoading
                ? (i18n?.t("crm.settings.loading_telegram_tags") ??
                  "Loading Telegram tags…")
                : (i18n?.t("crm.settings.select_telegram_tags") ??
                  "Select Telegram tags")
            }
            compactSelectedAfter={null}
          />
        </div>
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-white">
            <span>{i18n?.t("crm.settings.purchase_tag") ?? "Purchase tag"}</span>
            <Tooltip
              content={
                i18n?.t("crm.settings.purchase_tag_help") ??
                "Applied automatically to buyers. A Telegram-folder tag also moves their Telegram chat into that folder."
              }
              side="top"
              align="left"
            >
              <button
                type="button"
                aria-label={`${i18n?.t("crm.settings.purchase_tag") ?? "Purchase tag"} info`}
                className="inline-flex text-neutral-500 transition hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <CircleHelp size={15} aria-hidden="true" />
              </button>
            </Tooltip>
          </div>
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
            placeholder={
              tags.isLoading
                ? (i18n?.t("crm.settings.loading_tags") ?? "Loading tags…")
                : (i18n?.t("crm.settings.select_tags") ?? "Select tags")
            }
          />
        </div>
      </div>
      {!accounts.isLoading && !connected.length ? (
        <p className="mt-4 text-sm text-amber-300">
          {i18n?.t("crm.settings.no_account") ??
            "Connect an MTProto account in Telegram resources first."}
        </p>
      ) : null}
      {settings.isError || tags.isError || accounts.isError ? (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {i18n?.t("crm.settings.load_error") ??
            "CRM source settings could not be loaded. Refresh and try again."}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-neutral-800 pt-4">
        <Button
          type="button"
          variant="secondary"
          disabled={
            !canEdit ||
            !hasUnsavedChanges ||
            save.isPending ||
            sync.isPending ||
            accounts.isLoading
          }
          onClick={() => save.mutate()}
        >
          {save.isPending
            ? (i18n?.t("crm.settings.saving") ?? "Saving…")
            : (i18n?.t("crm.settings.save") ?? "Save settings")}
        </Button>
        <Button
          type="button"
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
          {sync.isPending
            ? (i18n?.t("crm.settings.syncing") ?? "Syncing…")
            : hasUnsavedChanges
              ? (i18n?.t("crm.settings.save_sync") ?? "Save and sync")
              : (i18n?.t("crm.settings.sync") ?? "Sync now")}
        </Button>
      </div>
      {save.error ? (
        <p className="mt-3 text-sm text-rose-300">
          {i18n?.t("crm.settings.save_error") ??
            "CRM sources could not be saved."}
        </p>
      ) : null}
      {sync.error ? (
        <p className="mt-3 text-sm text-rose-300">
          {i18n?.t("crm.settings.sync_error") ??
            "Conversation sync failed. You can safely retry it."}
        </p>
      ) : null}
    </section>
  );
}
