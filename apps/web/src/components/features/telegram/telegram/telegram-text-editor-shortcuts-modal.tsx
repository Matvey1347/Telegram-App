"use client";

import { RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EditorCommandId, EditorShortcutPreferences } from "@telegram-system/shared";
import { Button, Modal } from "@/components/ui/primitives";
import { accountApi, authApi, type MeResponse } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { editorCommandDetails, effectiveEditorShortcuts, shortcutFromEvent, shortcutLabel } from "./telegram-text-editor-shortcuts";

export function TelegramTextEditorShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  const assign = (command: EditorCommandId, shortcut: string) => {
    const next: EditorShortcutPreferences = { ...shortcuts };
    for (const [id, value] of Object.entries(next)) if (value === shortcut) delete next[id as EditorCommandId];
    next[command] = shortcut;
    mutation.mutate(next);
  };

  return (
    <Modal open={open} onClose={onClose} title="Editor shortcuts" size="md">
      <p className="mb-4 text-sm text-neutral-400">Click a shortcut field, then press a key combination. Shortcuts are saved to your account and work in every text editor.</p>
      {meQuery.isLoading ? <p className="py-8 text-sm text-neutral-400">Loading shortcuts…</p> : (
        <div className="space-y-1">
          {editorCommandDetails.map((command) => (
            <div key={command.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-neutral-800/70">
              <div className="min-w-0"><p className="text-sm text-white">{command.label}</p><p className="text-xs text-neutral-500">{command.description}</p></div>
              <input
                aria-label={`${command.label} shortcut`}
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
      {mutation.isError ? <p className="mt-3 text-xs text-rose-400">Could not save the shortcut. Please try again.</p> : null}
      <div className="mt-4 flex justify-end"><Button type="button" variant="secondary" disabled={mutation.isPending} onClick={() => mutation.mutate({})}><RotateCcw size={15} /> Reset defaults</Button></div>
    </Modal>
  );
}
