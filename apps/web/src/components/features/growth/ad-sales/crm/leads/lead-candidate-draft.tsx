"use client";
import { useState } from "react";
import type {
  LeadCandidateDraftView,
  LeadCandidateDraftPatch,
} from "@telegram-system/shared";
import { Button, Textarea } from "@/components/ui/primitives";
import { aiMoney } from "@/components/features/operations/ai/ai-format";
import { displayLeadDate } from "./lead-utils";
import { useQualificationText } from "./qualification-copy";
export function LeadCandidateDraft({
  draft,
  pending,
  onPatch,
  onCopy,
}: {
  draft: LeadCandidateDraftView;
  pending: boolean;
  onPatch: (action: LeadCandidateDraftPatch["action"], text?: string) => void;
  onCopy: () => Promise<void>;
}) {
  const t = useQualificationText();
  const [text, setText] = useState(draft.text);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const changed = text !== draft.text;
  return (
    <section className="space-y-3 border-t border-neutral-800 pt-4">
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <span>
          {draft.status} · {t("Revision")} {draft.revision}
        </span>
        <span>
          {aiMoney(draft.operation?.actualCost ?? null)} ·{" "}
          {draft.operation?.pricingStatus ?? "UNKNOWN"}
        </span>
      </div>
      <label className="block text-xs">
        {t("Prepared first message")}
        <Textarea
          className="mt-2 min-h-36"
          aria-label={t("Prepared first message")}
          maxLength={3000}
          rows={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCopied(false);
          }}
          disabled={!draft.canEdit || pending}
        />
      </label>
      <p className="text-xs text-neutral-400">
        {draft.tone} · {draft.language} · {t("Expires")}{" "}
        {displayLeadDate(draft.expiresAt)}
      </p>
      {[
        "STALE",
        "REVIEW_REQUIRED",
        "EXPIRED",
        "UNKNOWN",
        "GENERATING",
      ].includes(draft.status) ? (
        <p role="status" className="text-xs text-amber-200">
          {t(
            "This draft needs current evidence and approval. No automatic retry or send.",
          )}
        </p>
      ) : null}
      {draft.warnings.length ? (
        <ul className="list-inside list-disc break-words text-xs text-amber-200">
          {draft.warnings.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      ) : null}
      {draft.output?.reasoningSummary ? (
        <p className="text-xs text-neutral-400">
          {draft.output.reasoningSummary}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={pending || !draft.canEdit || !changed || !text.trim()}
          onClick={() => onPatch("SAVE", text)}
        >
          {t("Save changes")}
        </Button>
        <Button
          disabled={
            pending ||
            !draft.canEdit ||
            changed ||
            !text.trim() ||
            ["STALE", "UNKNOWN", "EXPIRED"].includes(draft.status)
          }
          onClick={() => onPatch("APPROVE")}
        >
          {t("Approve first message")}
        </Button>
        <Button
          variant="secondary"
          disabled={pending || changed || !draft.canCopy}
          onClick={() => {
            setCopyError(false);
            void onCopy()
              .then(() => setCopied(true))
              .catch(() => setCopyError(true));
          }}
        >
          {t("Copy approved message")}
        </Button>
        <Button
          variant="secondary"
          disabled={pending || !draft.canEdit}
          onClick={() => onPatch("DISCARD")}
        >
          {t("Discard")}
        </Button>
      </div>
      {changed ? (
        <p className="text-xs text-amber-200">
          {t(
            "Save the edit, then approve again. Typing does not write to the server.",
          )}
        </p>
      ) : null}
      {copied ? (
        <p role="status" className="text-xs text-emerald-300">
          {t(
            "Approved message copied. Sending remains a separate manual action.",
          )}
        </p>
      ) : null}
      {copyError ? (
        <p role="alert" className="text-xs text-amber-200">
          {t(
            "Copy blocked. Reload current source, contact and approval state.",
          )}
        </p>
      ) : null}
      <p className="text-xs text-neutral-400">
        {t(
          "No conversation is created here. Candidate approval does not authorize a Telegram send.",
        )}
      </p>
    </section>
  );
}
