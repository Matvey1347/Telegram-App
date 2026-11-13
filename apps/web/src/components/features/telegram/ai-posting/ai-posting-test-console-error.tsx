import Link from "next/link";
import { failureMessage } from "./ai-posting-test-console-model";

export function AiPostingTestConsoleError({
  code,
  status,
}: {
  code: string;
  status?: number;
}) {
  if (!code) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-900 bg-rose-950/30 p-3 text-sm text-rose-200"
    >
      {code === "AI_DISABLED" ? (
        <>
          AI для рабочего пространства или одного из этапов AI Posting выключен,
          либо ключ провайдера недоступен. Проверьте{" "}
          <Link href="/settings/ai-usage" className="underline">
            настройки AI
          </Link>
          : рабочее пространство и категории Telegram Posting Plan, Text, Review
          и Image.
        </>
      ) : code === "AI_BUDGET_REQUIRED" ||
        code === "AI_BUDGET_EXHAUSTED" ||
        code === "AI_REQUEST_BUDGET_EXCEEDED" ? (
        <>
          Проверьте доступные лимиты расходов в{" "}
          <Link href="/settings/ai-usage" className="underline">
            настройках AI
          </Link>
          .
        </>
      ) : (
        (failureMessage[code] ??
        (status
          ? `Сервер ответил с ошибкой ${status}. Запуск и завершённые этапы сохранены ниже, если модель успела начать работу.`
          : "Действие не завершилось. Откройте запуск ниже: там сохранены созданные публикации и причины ошибок."))
      )}
    </p>
  );
}
