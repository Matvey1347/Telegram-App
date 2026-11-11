import { Button } from "@/components/ui/primitives";

export type AiPostingFeedbackSuggestion = {
  id: string;
  type?: "add_rule" | "set_ending" | "append_description";
  text?: string;
  value?: string;
  key?: string;
  reason?: string;
};

export function AiPostingFeedbackSuggestion({
  item,
  pending,
  onConfirm,
}: {
  item: AiPostingFeedbackSuggestion;
  pending: boolean;
  onConfirm: () => void;
}) {
  const summary =
    item.type === "add_rule"
      ? `Добавить правило: ${item.text ?? ""}`
      : item.type === "append_description"
        ? `Дополнить описание: ${item.text ?? ""}`
        : item.type === "set_ending"
          ? `Заменить концовку: ${item.value ?? ""}`
          : `${item.key ?? "Правка"} → ${item.value ?? item.text ?? ""}`;
  return (
    <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 p-3 text-sm">
      <p>
        <strong>Предложение:</strong> {summary}
      </p>
      <p className="mt-1 text-neutral-300">{item.reason}</p>
      <Button
        className="mt-2"
        variant="secondary"
        disabled={pending}
        onClick={onConfirm}
      >
        Подтвердить и применить
      </Button>
    </div>
  );
}
