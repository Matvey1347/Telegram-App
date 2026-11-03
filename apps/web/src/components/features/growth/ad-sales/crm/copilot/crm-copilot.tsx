"use client";
import { forwardRef, useImperativeHandle, useState } from "react";
import { RotateCw, Sparkles, X } from "lucide-react";
import type { CrmCopilotDraft } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { CrmCopilotDraftEditor } from "./crm-copilot-draft";
import { useCrmCopilot } from "./use-crm-copilot";

export type CrmCopilotHandle = { review: (id: string, text: string) => void; activate: () => void };
function failureMessage(draft: CrmCopilotDraft) {
  const warnings = draft.warnings.join(" ");
  if (/POLICY|PERMISSION|ACCESS|PROCESSING/.test(warnings))
    return "ИИ недоступен: проверьте доступ к этому workspace и клиенту.";
  if (/BUDGET|LIMIT/.test(warnings))
    return "Достигнут лимит ИИ. Подробности — в статистике AI Usage.";
  if (/AUTH|KEY/.test(warnings))
    return "Не удалось подключиться к ИИ. Администратору нужно проверить ключ сервиса.";
  if (/RATE/.test(warnings))
    return "Сервис ИИ занят. Попробуйте сгенерировать ответ немного позже.";
  return "Не удалось сгенерировать ответ. Можно повторить запрос новой кнопкой генерации.";
}
export const CrmCopilot = forwardRef<
  CrmCopilotHandle,
  {
    workspaceId: string;
    conversationId: string;
    contactId: string | null;
    canSend: boolean;
    compactTrigger?: boolean;
    onInsert: (draft: CrmCopilotDraft) => void;
  }
>(function CrmCopilot(
  { workspaceId, conversationId, contactId, canSend, onInsert, compactTrigger = false },
  ref,
) {
  const copilot = useCrmCopilot(workspaceId, conversationId, contactId);
  const [review, setReview] = useState<{ id: string; text: string } | null>(
    null,
  );
  const items = copilot.drafts.data?.items ?? [];
  const selected = review
    ? items.find((item) => item.id === review.id)
    : items[0];
  const ready =
    selected &&
    ["READY", "REVIEW_REQUIRED", "APPROVED", "STALE"].includes(
      selected.status,
    ) &&
    !!selected.text;
  const uncertain =
    selected && ["UNKNOWN", "GENERATING"].includes(selected.status);
  const generate = () => {
    setReview(null);
    void copilot.generate();
  };
  const recoveryRequired = Boolean(uncertain || copilot.generation.isError);
  const checkGeneration = () => {
    copilot.setOpen(true);
    if (copilot.generation.isError && copilot.canRetry)
      void copilot.generate(true);
    else void copilot.drafts.refetch();
  };
  useImperativeHandle(ref, () => ({
    review: (id, text) => { setReview({ id, text }); copilot.setOpen(true); },
    activate: () => {
      if (!canSend || copilot.generation.isPending || copilot.update.isPending || (recoveryRequired && copilot.drafts.isFetching)) return;
      if (recoveryRequired) checkGeneration(); else generate();
    },
  }));
  if (compactTrigger && !copilot.open) return null;
  return (
    <section
      aria-label="AI Sales Copilot"
      className="min-h-0 shrink overflow-hidden border-t border-neutral-800 bg-blue-950/10 px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={
            !canSend ||
            copilot.generation.isPending ||
            copilot.update.isPending ||
            (recoveryRequired && copilot.drafts.isFetching)
          }
          onClick={recoveryRequired ? checkGeneration : generate}
          className="!min-h-9 text-xs"
        >
          <Sparkles size={15} aria-hidden />
          {copilot.generation.isPending
            ? "Генерирую ответ…"
            : recoveryRequired
              ? "Проверить генерацию"
              : "Сгенерировать ответ"}
        </Button>
        {!copilot.open ? (
          <span className="text-xs text-neutral-500">
            {recoveryRequired
              ? "Результат предыдущего запроса ещё не подтверждён"
              : "ИИ учитывает переписку и клиента"}
          </span>
        ) : (
          <button
            type="button"
            aria-label="Скрыть ответ ИИ"
            title="Скрыть ответ ИИ"
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded text-neutral-400 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={() => { copilot.cancel(); copilot.setOpen(false); }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {copilot.open ? (
        <div className="mt-2 max-h-[24dvh] space-y-2 overflow-y-auto overscroll-contain">
          {copilot.generation.isPending ? (
            <p role="status" className="text-xs text-neutral-400">
              Готовлю персональный ответ по контексту…
            </p>
          ) : null}
          {!copilot.generation.isPending && ready ? (
            <CrmCopilotDraftEditor
              key={`${selected.id}:${selected.revision}:${review?.text ?? ""}`}
              draft={selected}
              initialText={review?.text}
              pending={copilot.update.isPending}
              contextChanged={copilot.changed}
              canSend={canSend}
              onPatch={async (draft, action, text) => {
                const result = await copilot.patch(draft, action, text);
                if (result) setReview(null);
                return result;
              }}
              onInsert={onInsert}
            />
          ) : null}
          {!copilot.generation.isPending && selected?.status === "FAILED" ? (
            <p role="alert" className="text-xs text-amber-200">
              {failureMessage(selected)}
            </p>
          ) : null}
          {!copilot.generation.isPending && selected?.status === "DISCARDED" ? (
            <p role="status" className="text-xs text-neutral-400">
              Учтём эту оценку при следующей генерации.
            </p>
          ) : null}
          {!copilot.generation.isPending && uncertain ? (
            <div role="status" className="space-y-2 text-xs text-amber-200">
              <p>
                Ответ ещё готовится или его результат не подтверждён. Проверьте
                сохранённый результат перед новой генерацией.
              </p>
              <Button
                variant="secondary"
                onClick={() => void copilot.drafts.refetch()}
                disabled={copilot.drafts.isFetching}
              >
                Проверить результат
              </Button>
            </div>
          ) : null}
          {copilot.generation.isError ? (
            <div role="alert" className="space-y-2 text-xs text-amber-200">
              <p>
                Не удалось получить результат запроса. Сначала проверьте его,
                чтобы не оплачивать повторную генерацию.
              </p>
              <Button
                variant="secondary"
                disabled={copilot.generation.isPending || !copilot.canRetry}
                onClick={() => void copilot.generate(true)}
              >
                <RotateCw size={14} aria-hidden />
                Проверить запрос
              </Button>
            </div>
          ) : null}
          {copilot.update.isError ? (
            <p role="alert" className="text-xs text-amber-200">
              Не удалось использовать ответ. Возможно, изменились переписка,
              условия или права доступа.
            </p>
          ) : null}
          {copilot.drafts.isError && !selected ? (
            <p role="alert" className="text-xs text-amber-200">
              Не удалось загрузить сохранённые ответы. Обычная переписка
              доступна.
            </p>
          ) : null}
          {review && !selected && !copilot.drafts.isLoading ? (
            <p role="alert" className="text-xs text-amber-200">
              Этот ответ недоступен или устарел. Сохраните ваш текст и
              сгенерируйте новый вариант.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
});
