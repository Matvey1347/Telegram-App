"use client";
import { useCopilotText } from "./copilot-copy";
import { forwardRef, useImperativeHandle, useState } from "react";
import type { CrmCopilotDraft } from "@telegram-system/shared";
import { Button, Select } from "@/components/ui/primitives";
import {
  CrmCopilotOptions,
  initialCopilotOptions,
} from "./crm-copilot-options";
import { CrmCopilotDetails } from "./crm-copilot-details";
import { CrmCopilotDraftEditor } from "./crm-copilot-draft";
import { useCrmCopilot } from "./use-crm-copilot";
export type CrmCopilotHandle = { review: (id: string, text: string) => void };
export const CrmCopilot = forwardRef<
  CrmCopilotHandle,
  {
    workspaceId: string;
    conversationId: string;
    contactId: string | null;
    canSend: boolean;
    onInsert: (draft: CrmCopilotDraft) => void;
  }
>(function CrmCopilot(
  { workspaceId, conversationId, contactId, canSend, onInsert },
  ref,
) {
  const t = useCopilotText();
  const copilot = useCrmCopilot(workspaceId, conversationId, contactId);
  const [options, setOptions] = useState(initialCopilotOptions);
  const { details, setDetails } = copilot;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reviewText, setReviewText] = useState<string | undefined>();
  useImperativeHandle(ref, () => ({
    review: (id, text) => {
      copilot.setOpen(true);
      setSelectedId(id);
      setReviewText(text);
    },
  }));
  const items = copilot.drafts.data?.items ?? [];
  const selected = selectedId
    ? items.find((v) => v.id === selectedId)
    : items[0];
  const input = {
    ...options,
    processingReference: copilot.context.data?.processingReference ?? "",
    sourceAcknowledged: Boolean(copilot.context.data?.processingReference),
    productIds: copilot.productIds,
    includeNotes: copilot.includeNotes,
  };
  const eligible =
    !!copilot.context.data?.canGenerate &&
    Boolean(copilot.context.data?.processingReference);
  return (
    <section
      aria-label="AI Sales Copilot"
      className="flex min-h-0 shrink flex-col overflow-hidden border-t border-neutral-700 bg-blue-950/20 px-3 py-1.5"
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <button
          type="button"
          className="min-h-10 text-sm font-semibold text-blue-200"
          aria-expanded={copilot.open}
          onClick={() => { if (!copilot.open) copilot.setPrepared(true); copilot.setOpen(!copilot.open); }}
        >
          ✦ AI Sales Copilot {copilot.open ? "−" : "+"}
        </button>
        <span className="text-xs text-neutral-400">
          {t("Human approval only")}
        </span>
      </div>
      {copilot.open ? (
        <div className="min-h-0 max-h-[30dvh] shrink space-y-3 overflow-y-auto overscroll-contain pb-3 pr-1">
          <p className="text-xs text-neutral-400">
            {t(
              "AI never sends messages or changes CRM status. Manual chat stays available.",
            )}
          </p>
          {copilot.drafts.isLoading ? (
            <p role="status">{t("Loading AI drafts…")}</p>
          ) : copilot.drafts.isError ? (
            <p role="alert" className="text-xs text-amber-200">
              AI drafts are unavailable. Manual messages still work.{" "}
              <button
                className="text-blue-300"
                onClick={() => void copilot.drafts.refetch()}
              >
                {t("Retry drafts")}
              </button>
            </p>
          ) : !items.length ? (
            <p className="text-xs text-neutral-400">
              {t("No saved AI drafts. Prepare context to create a suggestion.")}
            </p>
          ) : null}
          {items.length > 1 ? (
            <Select
              aria-label="Saved AI draft"
              value={selected?.id ?? ""}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setReviewText(undefined);
              }}
            >
              {items.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.category.replace("SALES_", "")} · {v.status} ·{" "}
                  {new Date(v.createdAt).toLocaleTimeString()}
                </option>
              ))}
            </Select>
          ) : null}
          {selectedId && !selected && !copilot.drafts.isLoading ? (
            <p role="alert" className="text-xs text-amber-200">
              {t(
                "This saved AI draft is unavailable or expired. Keep the text for review; it cannot be reapproved here.",
              )}
            </p>
          ) : null}
          {selected ? (
            <CrmCopilotDraftEditor
              key={`${selected.id}:${selected.revision}:${reviewText ?? ""}`}
              draft={selected}
              initialText={reviewText}
              contextChanged={copilot.changed}
              canSend={canSend}
              pending={copilot.update.isPending}
              onInsert={onInsert}
              onPatch={async (draft, action, text) => {
                const result = await copilot.patch(draft, action, text);
                if (result) setReviewText(undefined);
                return result;
              }}
            />
          ) : null}
          {copilot.update.isError ? (
            <p role="alert" className="text-xs text-amber-200">
              {t(
                "Draft could not be updated. Check current permissions, context and prices, then retry.",
              )}
            </p>
          ) : null}
          <button type="button" className="text-xs text-neutral-400 hover:text-neutral-200" onClick={() => setDetails(!details)}>{details ? "Скрыть подробности" : "Подробности"}</button>
          {details ? (
            <CrmCopilotDetails
              draft={selected}
              context={copilot.context.data}
              onClose={() => setDetails(false)}
            />
          ) : null}
          {copilot.prepared && !details ? (
            <div className="space-y-3 border-t border-neutral-700 pt-3">
              {copilot.context.isLoading ? (
                <p role="status">{t("Loading bounded context…")}</p>
              ) : copilot.context.isError ? (
                <p role="alert">
                  Context is unavailable.{" "}
                  <button
                    className="text-blue-300"
                    onClick={() => void copilot.context.refetch()}
                  >
                    {t("Retry context")}
                  </button>
                </p>
              ) : null}
              {copilot.context.data &&
              !copilot.context.data.processingEnabled ? (
                <p role="status" className="text-xs text-amber-200">
                  ИИ недоступен для этого workspace. Обратитесь к администратору.
                </p>
              ) : null}
              {copilot.context.data?.blockedReason ? (
                <p role="status" className="text-xs text-amber-200">
                  Generation unavailable: {copilot.context.data.blockedReason}
                </p>
              ) : null}
              <details className="rounded-lg border border-neutral-700 px-3 py-2">
                <summary className="cursor-pointer text-sm text-neutral-300">Настройки генерации</summary>
              <CrmCopilotOptions
                value={options}
                onChange={setOptions}
                context={copilot.context.data}
                choices={[
                  ...new Map(
                    [
                      ...(copilot.catalog.data?.pages.flatMap(
                        (p) => p.products,
                      ) ?? []),
                      ...(copilot.context.data?.products ?? []),
                    ].map((p) => [p.id, p]),
                  ).values(),
                ]}
                products={copilot.productIds}
                onProducts={copilot.setProductIds}
                notes={copilot.includeNotes}
                onNotes={copilot.setIncludeNotes}
                disabled={copilot.generation.isPending}
              />
              {copilot.catalog.hasNextPage ? (
                <Button
                  variant="secondary"
                  disabled={copilot.catalog.isFetchingNextPage}
                  onClick={() => void copilot.catalog.fetchNextPage()}
                >
                  Load more products
                </Button>
              ) : null}
              {copilot.catalog.isError ? (
                <p role="alert" className="text-xs text-amber-200">
                  Product choices could not be loaded.{" "}
                  <button onClick={() => void copilot.catalog.refetch()}>
                    Retry products
                  </button>
                </p>
              ) : null}
              </details>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    !eligible ||
                    copilot.generation.isPending ||
                    copilot.update.isPending
                  }
                  onClick={() => {
                    setSelectedId(null);
                    setReviewText(undefined);
                    void copilot.generate(input);
                  }}
                >
                  {copilot.generation.isPending
                    ? "Generating…"
                    : selected
                      ? "Regenerate suggestion"
                      : "Generate suggestion"}
                </Button>
                {copilot.generation.isPending ? (
                  <Button variant="secondary" onClick={copilot.cancel}>
                    {t("Stop waiting")}
                  </Button>
                ) : null}
                {copilot.generation.isError && copilot.canRetry ? (
                  <Button
                    variant="secondary"
                    disabled={copilot.generation.isPending}
                    onClick={() => void copilot.generate(input, true)}
                  >
                    {t("Check same operation")}
                  </Button>
                ) : null}
              </div>
              {copilot.generation.isPending || copilot.generation.isError ? (
                <p className="text-xs text-amber-200">
                  {t(
                    "Generation may continue and incur cost; reopen Copilot to recover. No automatic retry.",
                  )}
                </p>
              ) : null}
              {copilot.generation.isError ? (
                <p role="alert" className="text-xs text-amber-200">
                  {t(
                    "Generation outcome is uncertain or unavailable. No automatic paid retry occurs. Check the same operation, or explicitly request a new suggestion. Manual chat remains available.",
                  )}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
