import { useState } from "react";
import { Button, Card, Input, ToggleRow } from "@/components/ui/primitives";

export type AiPostingRule = {
  id: string;
  text: string;
  source: "feedback" | "manual";
  active: boolean;
  createdAt: string;
  feedbackId?: string;
};

export function AiPostingRulesSection({
  rules,
  onChange,
}: {
  rules: AiPostingRule[];
  onChange: (rules: AiPostingRule[]) => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const value = text.trim();
    if (!value) return;
    onChange([
      ...rules,
      {
        id: crypto.randomUUID(),
        text: value,
        source: "manual",
        active: true,
        createdAt: new Date().toISOString(),
      },
    ]);
    setText("");
  };
  return (
    <Card className="space-y-3 bg-neutral-900/60">
      <div>
        <h2 className="text-lg font-semibold">Обязательные правила канала</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Активные правила учитываются при планировании, написании и проверке.
        </p>
      </div>
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="flex items-start gap-3 rounded-lg border border-neutral-800 p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-wrap text-sm text-neutral-200">
              {rule.text}
            </p>
            <span className="text-xs text-neutral-500">
              {rule.source === "feedback"
                ? "Из правки владельца"
                : "Добавлено вручную"}
            </span>
            <ToggleRow
              checked={rule.active}
              onChange={(active) =>
                onChange(
                  rules.map((item) =>
                    item.id === rule.id ? { ...item, active } : item,
                  ),
                )
              }
              label={rule.active ? "Включено" : "Выключено"}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onChange(rules.filter((item) => item.id !== rule.id))
            }
            aria-label={`Удалить правило: ${rule.text}`}
          >
            Удалить
          </Button>
        </div>
      ))}
      {!rules.length && (
        <p className="text-sm text-neutral-500">Правила ещё не добавлены.</p>
      )}
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Например: не используйте кликбейтные заголовки"
          aria-label="Новое правило канала"
        />
        <Button type="button" onClick={add} disabled={!text.trim()}>
          Добавить
        </Button>
      </div>
    </Card>
  );
}
