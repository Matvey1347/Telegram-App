"use client";
import { useCopilotText } from "./copilot-copy";
import { useState } from "react";
import type {
  CrmCopilotDraft,
  CrmCopilotDraftPatch,
} from "@telegram-system/shared";
import { Button, Textarea } from "@/components/ui/primitives";
import { aiMoney } from "@/components/features/operations/ai/ai-format";
export function CrmCopilotDraftEditor({
  draft,
  initialText,
  onPatch,
  onInsert,
  pending,
  contextChanged,
  canSend,
}: {
  draft: CrmCopilotDraft;
  initialText?: string;
  onPatch: (
    draft: CrmCopilotDraft,
    action: CrmCopilotDraftPatch["action"],
    text?: string,
  ) => Promise<unknown>;
  onInsert: (draft: CrmCopilotDraft) => void;
  pending: boolean;
  contextChanged: boolean;
  canSend: boolean;
}) {
  const t = useCopilotText();
  const [text, setText] = useState(initialText ?? draft.text);
  const changed = text !== draft.text;
  const blocked = [
    "GENERATING",
    "UNKNOWN",
    "FAILED",
    "DISCARDED",
    "EXPIRED",
    "SENT",
  ].includes(draft.status);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <span>
          {draft.status} · revision {draft.revision}
        </span>
        <span>
          {aiMoney(draft.operation?.actualCost ?? null)} ·{" "}
          {draft.operation?.pricingStatus ?? "UNKNOWN"}
        </span>
      </div>
      <label className="block text-xs text-neutral-300">
        {t("Suggested message")}
        <Textarea
          aria-label="AI suggested message"
          className="mt-1"
          rows={3}
          maxLength={4096}
          value={text}
          disabled={pending || !draft.canEdit || blocked}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {["UNKNOWN", "GENERATING"].includes(draft.status) ? (
        <p role="status" className="text-xs text-amber-200">
          {t(
            "Generation outcome is uncertain or still running. Reopen drafts to check saved state; a new suggestion is a new explicitly paid operation.",
          )}
        </p>
      ) : null}
      {draft.output?.reasoningSummary ? (
        <p className="text-xs text-neutral-400">
          {draft.output.reasoningSummary}
        </p>
      ) : null}
      {draft.output?.requiresHumanReview ? (
        <p className="text-xs text-amber-200">
          {t("Human review required. Verify every claim before approval.")}
        </p>
      ) : null}
      {draft.warnings.length ? (
        <ul className="list-inside list-disc text-xs text-amber-200">
          {draft.warnings.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      ) : null}
      {contextChanged || ["STALE", "REVIEW_REQUIRED"].includes(draft.status) ? (
        <p role="status" className="text-xs text-amber-200">
          {t(
            "Context, status or prices may have changed. Save and obtain fresh approval before sending.",
          )}
        </p>
      ) : null}
      {changed ? (
        <p className="text-xs text-amber-200">
          {t("Edited text must be saved and approved again.")}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={
            pending || blocked || !draft.canEdit || !changed || !text.trim()
          }
          onClick={() => void onPatch(draft, "SAVE", text)}
        >
          {t("Save edited draft")}
        </Button>
        <Button
          variant="secondary"
          disabled={
            pending || blocked || !draft.canEdit || changed || !text.trim()
          }
          onClick={() => void onPatch(draft, "APPROVE")}
        >
          {t("Approve reviewed text")}
        </Button>
        <Button
          disabled={
            !canSend ||
            pending ||
            changed ||
            contextChanged ||
            draft.status !== "APPROVED"
          }
          onClick={() => onInsert(draft)}
        >
          {t("Insert approved text")}
        </Button>
        <Button
          variant="secondary"
          disabled={pending || blocked || !draft.canEdit}
          onClick={() => void onPatch(draft, "DISCARD")}
        >
          {t("Discard")}
        </Button>
      </div>
      <p className="text-xs text-neutral-400">
        {t(
          "Insertion does not send. Review the composer, then use the existing Send button.",
        )}
      </p>
    </div>
  );
}
