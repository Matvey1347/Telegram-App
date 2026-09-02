"use client";


import { RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EditorCommandId, EditorShortcutPreferences } from "@telegram-system/shared";
import { Button, Modal } from "@/components/ui/primitives";
import { accountApi, authApi, type MeResponse } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { editorCommandDetails, effectiveEditorShortcuts, shortcutFromEvent, shortcutLabel } from "./telegram-text-editor-shortcuts";
import { useI18n } from "@/providers/i18n-provider";

export function TelegramTextEditorShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const meQuery = useQuery({ queryKey: authKeys.me(), queryFn: authApi.me, enabled: open });
  const preferences = meQuery.data?.user.editorShortcuts;
  const mutation = useMutation({
    mutationFn: (editorShortcuts: EditorShortcutPreferences) => accountApi.updateMe({ editorShortcuts }),
    onSuccess: (account) => {
      queryClient.setQueryData<MeResponse>(authKeys.me(), (current) => current ? {
        ...current,
        user: { ...current.user, editorShortcuts: account.editorShortcuts ?? {} },
      } : current);
      onClose();
    },
  });
  const shortcuts = effectiveEditorShortcuts(preferences);
  const commandCopy: Record<EditorCommandId, { label: string; description: string }> = {
    bold: { label: t("telegram.posts.editorComponents.format.bold"), description: t("telegram.posts.editorComponents.shortcuts.boldDescription") },
    italic: { label: t("telegram.posts.editorComponents.format.italic"), description: t("telegram.posts.editorComponents.shortcuts.italicDescription") },
    underline: { label: t("telegram.posts.editorComponents.format.underline"), description: t("telegram.posts.editorComponents.shortcuts.underlineDescription") },
    strikethrough: { label: t("telegram.posts.editorComponents.format.strikethrough"), description: t("telegram.posts.editorComponents.shortcuts.strikethroughDescription") },
    spoiler: { label: t("telegram.posts.editorComponents.format.spoiler"), description: t("telegram.posts.editorComponents.shortcuts.spoilerDescription") },
    inlineCode: { label: t("telegram.posts.editorComponents.format.inlineCode"), description: t("telegram.posts.editorComponents.shortcuts.inlineCodeDescription") },
    codeBlock: { label: t("telegram.posts.editorComponents.format.codeBlock"), description: t("telegram.posts.editorComponents.shortcuts.codeBlockDescription") },
    quote: { label: t("telegram.posts.editorComponents.format.quote"), description: t("telegram.posts.editorComponents.shortcuts.quoteDescription") },
    pullQuote: { label: t("telegram.posts.editorComponents.format.pullQuote"), description: t("telegram.posts.editorComponents.shortcuts.pullQuoteDescription") },
    heading: { label: t("telegram.posts.editorComponents.format.heading"), description: t("telegram.posts.editorComponents.shortcuts.headingDescription") },
    bulletedList: { label: t("telegram.posts.editorComponents.format.bulletedList"), description: t("telegram.posts.editorComponents.shortcuts.bulletedListDescription") },
    numberedList: { label: t("telegram.posts.editorComponents.format.numberedList"), description: t("telegram.posts.editorComponents.shortcuts.numberedListDescription") },
    table: { label: t("telegram.posts.editorComponents.format.table"), description: t("telegram.posts.editorComponents.shortcuts.tableDescription") },
    formula: { label: t("telegram.posts.editorComponents.format.formula"), description: t("telegram.posts.editorComponents.shortcuts.formulaDescription") },
    link: { label: t("telegram.posts.editorComponents.format.insertLink"), description: t("telegram.posts.editorComponents.shortcuts.linkDescription") },
    emoji: { label: t("telegram.posts.editorComponents.format.emoji"), description: t("telegram.posts.editorComponents.shortcuts.emojiDescription") },
    buttons: { label: t("telegram.posts.editorComponents.inlineButtons.title"), description: t("telegram.posts.editorComponents.shortcuts.buttonsDescription") },
  };

  const assign = (command: EditorCommandId, shortcut: string) => {
    const next: EditorShortcutPreferences = { ...shortcuts };
    for (const [id, value] of Object.entries(next)) if (value === shortcut) delete next[id as EditorCommandId];
    next[command] = shortcut;
    mutation.mutate(next);
  };

  return (
    <Modal open={open} onClose={onClose} title={t("telegram.posts.editorComponents.shortcuts.title")} size="md">
      <p className="mb-4 text-sm text-neutral-400">{t("telegram.posts.editorComponents.shortcuts.description")}</p>
      {meQuery.isLoading ? <p className="py-8 text-sm text-neutral-400">{t("telegram.posts.editorComponents.shortcuts.loading")}</p> : (
        <div className="space-y-1">
          {editorCommandDetails.map((command) => (
            <div key={command.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-neutral-800/70">
              <div className="min-w-0"><p className="text-sm text-white">{commandCopy[command.id].label}</p><p className="text-xs text-neutral-500">{commandCopy[command.id].description}</p></div>
              <input
                aria-label={t("telegram.posts.editorComponents.shortcuts.commandLabel", { command: commandCopy[command.id].label })}
                readOnly
                disabled={mutation.isPending}
                value={shortcutLabel(shortcuts[command.id] ?? "")}
                onKeyDown={(event) => {
                  const shortcut = shortcutFromEvent(event.nativeEvent);
                  if (!shortcut) return;
                  event.preventDefault();
                  assign(command.id, shortcut);
                }}
                className="min-w-28 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-center text-xs text-neutral-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
          ))}
        </div>
      )}
      {mutation.isError ? <p className="mt-3 text-xs text-rose-400">{t("telegram.posts.editorComponents.shortcuts.saveError")}</p> : null}
      <div className="mt-4 flex justify-end"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate({})}><RotateCcw size={15} /> {t("telegram.posts.editorComponents.shortcuts.reset")}</Button></div>
    </Modal>
  );
}
