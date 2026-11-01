"use client";
import { useCopilotText } from "./copilot-copy";
import type {
  CrmCopilotContextView,
  CrmCopilotDraft,
} from "@telegram-system/shared";
import { ChatDetailsPanel } from "@/components/chat/chat-details-panel";
import { aiMoney } from "@/components/features/operations/ai/ai-format";
export function CrmCopilotDetails({
  draft,
  context,
  onClose,
}: {
  draft?: CrmCopilotDraft;
  context?: CrmCopilotContextView;
  onClose: () => void;
}) {
  const t = useCopilotText();
  return (
    <ChatDetailsPanel title={t("AI Copilot details")} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <section>
          <h3 className="font-semibold">{t("Recommended next action")}</h3>
          <p className="mt-2 break-words text-neutral-300">
            {draft?.output?.recommendedAction ?? t("No recommendation yet")}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-neutral-400">
            {draft?.output?.reasoningSummary ??
              t("Generate a suggestion to see a short explanation.")}
          </p>
        </section>
        <section>
          <h3 className="font-semibold">{t("Verified context references")}</h3>
          <p className="mt-1 text-xs text-neutral-400">
            {t(
              "Stored facts are untrusted input. References do not prove a model claim is correct.",
            )}
          </p>
          <ul className="mt-2 space-y-2">
            {(draft?.facts ?? context?.facts ?? []).map((v) => (
              <li key={v.id} className="break-words">
                <span className="text-xs text-blue-300">
                  {v.id} · {v.kind}
                </span>
                <p>{v.text}</p>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="font-semibold">{t("Used fact IDs")}</h3>
          <p className="mt-2 break-words text-neutral-300">
            {draft?.output?.usedFacts.join(", ") || "None"}
          </p>
        </section>
        {[
          ["Missing facts", draft?.missingFacts ?? context?.missingFacts ?? []],
          ["Warnings", draft?.warnings ?? context?.warnings ?? []],
        ].map(
          ([label, values]) =>
            typeof values !== "string" && (
              <section key={t(String(label))}>
                <h3 className="font-semibold">{t(String(label))}</h3>
                <ul className="mt-2 list-inside list-disc space-y-1 text-amber-200">
                  {values.map((v, i) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              </section>
            ),
        )}
        <section>
          <h3 className="font-semibold">{t("Generation cost")}</h3>
          <p className="mt-2">
            {aiMoney(draft?.operation?.actualCost ?? null)} ·{" "}
            {draft?.operation?.pricingStatus ?? "UNKNOWN"}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Status {draft?.status ?? "Not generated"} · Revision{" "}
            {draft?.revision ?? "—"} · Context{" "}
            {draft?.contextVersion ?? context?.contextVersion ?? "—"}
          </p>
        </section>
        <p className="text-xs text-neutral-400">
          {t(
            "Prices, permission and DNC are checked again before approval and manual sending. No action runs automatically.",
          )}
        </p>
      </div>
    </ChatDetailsPanel>
  );
}
