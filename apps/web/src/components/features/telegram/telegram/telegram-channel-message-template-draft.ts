import type { TelegramChannelMessageTemplatePayload } from "@telegram-system/shared";
import type { WorkspaceDraftPreview } from "@/hooks/use-workspace-modal-drafts";
import {
  readWorkspaceModalDrafts,
  removeWorkspaceModalDraft,
  writeWorkspaceModalDraft,
} from "@/lib/workspace-modal-drafts";

const NAMESPACE = "telegram-channel-message-template:draft";

export type TelegramChannelMessageTemplateDraft = {
  version: 1;
  id?: string;
  createdAt?: string;
  savedTemplateId?: string | null;
  form: TelegramChannelMessageTemplatePayload;
  preview?: WorkspaceDraftPreview;
};

function normalize(
  value: unknown,
  index: number,
): TelegramChannelMessageTemplateDraft | null {
  const draft = value as Partial<TelegramChannelMessageTemplateDraft>;
  if (
    draft.version !== 1 ||
    !draft.form ||
    !Array.isArray(draft.form.channelIds) ||
    typeof draft.form.bodyTemplate !== "string"
  ) {
    return null;
  }
  return {
    version: 1,
    id: draft.id || `legacy-${index}`,
    createdAt: draft.createdAt || new Date(0).toISOString(),
    savedTemplateId: draft.savedTemplateId || null,
    form: draft.form,
    preview: draft.preview,
  };
}

export function readTelegramChannelMessageTemplateDrafts(
  storage?: Storage | null,
) {
  return readWorkspaceModalDrafts(storage, NAMESPACE, normalize);
}

export function writeTelegramChannelMessageTemplateDraft(
  storage: Storage | null | undefined,
  draft: TelegramChannelMessageTemplateDraft,
) {
  writeWorkspaceModalDraft(storage, NAMESPACE, draft, normalize);
}

export function removeTelegramChannelMessageTemplateDraft(
  storage: Storage | null | undefined,
  id?: string,
) {
  removeWorkspaceModalDraft(storage, NAMESPACE, id, normalize);
}
