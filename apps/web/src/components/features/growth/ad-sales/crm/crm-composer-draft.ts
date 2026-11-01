import type {
  CrmCopilotDraft,
  CrmCopilotSendApproval,
} from "@telegram-system/shared";
export type ComposerAiApproval = CrmCopilotSendApproval & {
  approvedText: string;
};
export type ComposerDraft = {
  text: string;
  key: string;
  ai?: ComposerAiApproval;
};
export const emptyComposerDraft = (): ComposerDraft => ({ text: "", key: "" });
export function normalizeComposerDraft(value: unknown): ComposerDraft | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Partial<ComposerDraft>;
  if (typeof d.text !== "string" || typeof d.key !== "string") return null;
  if (
    d.ai &&
    (typeof d.ai.aiDraftId !== "string" ||
      !Number.isSafeInteger(d.ai.aiDraftRevision) ||
      d.ai.aiDraftRevision < 1 ||
      typeof d.ai.approvedText !== "string")
  )
    return null;
  return {
    text: d.text,
    key: d.ai ? `ai:${d.ai.aiDraftId}:${d.ai.aiDraftRevision}` : d.key,
    ...(d.ai
      ? {
          ai: {
            aiDraftId: d.ai.aiDraftId,
            aiDraftRevision: d.ai.aiDraftRevision,
            approvedText: d.ai.approvedText,
          },
        }
      : {}),
  };
}
export const composerAiChanged = (draft: ComposerDraft) =>
  !!draft.ai && draft.text.trim() !== draft.ai.approvedText.trim();
export function approvedComposerDraft(
  draft: CrmCopilotDraft,
): ComposerDraft | null {
  if (
    draft.status !== "APPROVED" ||
    !draft.text.trim() ||
    draft.text.length > 4096
  )
    return null;
  return {
    text: draft.text,
    key: `ai:${draft.id}:${draft.revision}`,
    ai: {
      aiDraftId: draft.id,
      aiDraftRevision: draft.revision,
      approvedText: draft.text,
    },
  };
}
export function messageAiApproval(
  metadata: unknown,
): CrmCopilotSendApproval | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const d = metadata as Partial<CrmCopilotSendApproval>;
  return typeof d.aiDraftId === "string" &&
    Number.isSafeInteger(d.aiDraftRevision) &&
    Number(d.aiDraftRevision) > 0
    ? { aiDraftId: d.aiDraftId, aiDraftRevision: d.aiDraftRevision! }
    : undefined;
}
