import type { FolderDraft } from "./mutual-promotion-form-types";
import {
  readWorkspaceModalDrafts,
  removeWorkspaceModalDraft,
  writeWorkspaceModalDraft,
} from "@/lib/workspace-modal-drafts";

const DRAFT_NAMESPACE = "mutual-promotion-folder:draft";

export type MutualPromotionModalDraft = {
  version: 1;
  id?: string;
  createdAt?: string;
  form: FolderDraft;
};

function normalize(
  value: unknown,
  index: number,
): MutualPromotionModalDraft | null {
  const draft = value as Partial<MutualPromotionModalDraft>;
  if (
    draft.version !== 1 ||
    !draft.form ||
    !Array.isArray(draft.form.participants)
  ) {
    return null;
  }
  return {
    version: 1,
    id: draft.id || `legacy-${index}`,
    createdAt: draft.createdAt || new Date(0).toISOString(),
    form: draft.form,
  };
}

export function readMutualPromotionDrafts(storage: Storage | null | undefined) {
  return readWorkspaceModalDrafts(storage, DRAFT_NAMESPACE, normalize);
}

export function writeMutualPromotionDraft(
  storage: Storage | null | undefined,
  draft: MutualPromotionModalDraft,
) {
  writeWorkspaceModalDraft(storage, DRAFT_NAMESPACE, draft, normalize);
}

export function removeMutualPromotionDraft(
  storage: Storage | null | undefined,
  draftId?: string,
) {
  removeWorkspaceModalDraft(storage, DRAFT_NAMESPACE, draftId, normalize);
}
