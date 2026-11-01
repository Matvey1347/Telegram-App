"use client";
import { useState } from "react";
import { Check, ThumbsDown } from "lucide-react";
import type {
  CrmCopilotDraft,
  CrmCopilotDraftPatch,
} from "@telegram-system/shared";
import { Button, Textarea } from "@/components/ui/primitives";

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
  ) => Promise<CrmCopilotDraft | undefined>;
  onInsert: (draft: CrmCopilotDraft) => void;
  pending: boolean;
  contextChanged: boolean;
  canSend: boolean;
}) {
  const [text, setText] = useState(initialText ?? draft.text);
  const [using, setUsing] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [feedback, setFeedback] = useState("");
  const stale = contextChanged || draft.status === "STALE";
  const reviewRequired =
    draft.status === "REVIEW_REQUIRED" ||
    draft.warnings.some((warning) =>
      /PRICE|PRICING|FINANCIAL|ASSERTION|CLAIM/.test(warning),
    );
  const blocked =
    !draft.canEdit ||
    !["READY", "REVIEW_REQUIRED", "APPROVED", "STALE"].includes(draft.status);
  const handleUseText = async () => {
    if (using || pending || blocked || stale || !canSend || !text.trim())
      return;
    setUsing(true);
    try {
      const approved = await onPatch(draft, "APPROVE", text.trim());
      if (approved?.status === "APPROVED") onInsert(approved);
    } finally {
      setUsing(false);
    }
  };
  return (
    <div className="space-y-2">
      <Textarea
        aria-label="AI suggested message"
        rows={3}
        maxLength={3000}
        value={text}
        disabled={pending || using || blocked}
        onChange={(event) => setText(event.target.value)}
        className="max-h-36 resize-y text-sm"
      />
      {reviewRequired ? (
        <p role="status" className="text-xs text-amber-200">
          Проверьте цену и условия в тексте: неподтверждённые суммы нужно убрать
          или уточнить.
        </p>
      ) : null}
      {stale ? (
        <p role="status" className="text-xs text-amber-200">
          Переписка или условия изменились. Сгенерируйте новый ответ.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={
            !canSend || pending || using || blocked || stale || !text.trim()
          }
          onClick={() => void handleUseText()}
        >
          <Check size={15} aria-hidden />
          {using ? "Подготовка…" : "Использовать"}
        </Button>
        <Button
          variant="secondary"
          disabled={pending || using || blocked}
          onClick={() => setExplaining(true)}
        >
          <ThumbsDown size={15} aria-hidden />
          Не подходит
        </Button>
        <span className="text-xs text-neutral-500">
          Текст можно изменить. Отправка — вашей кнопкой Send.
        </span>
      </div>
      {explaining ? <div className="space-y-2">
        <Textarea aria-label="Что не так с ответом" rows={2} maxLength={1000} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Что исправить в следующем ответе?" />
        <Button variant="secondary" disabled={pending || using || !feedback.trim()} onClick={() => void onPatch(draft, "DISCARD", `[MANAGER_FEEDBACK] ${feedback.trim()}`)}>Сохранить замечание</Button>
        <Button variant="secondary" disabled={pending || using} onClick={() => void onPatch(draft, "DISCARD")}>Отклонить без замечания</Button>
      </div> : null}
    </div>
  );
}
