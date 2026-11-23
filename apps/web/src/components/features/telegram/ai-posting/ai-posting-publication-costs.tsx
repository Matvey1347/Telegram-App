import type { TelegramAiPostingImageSearchRound } from "@telegram-system/shared";
import { money, totalCost, type Publication } from "./ai-posting-test-console-model";

const stages = {
  planning: "Планирование",
  text: "Текст",
  review: "Проверка текста",
  image: "Медиа",
};
const searchOutcome: Record<TelegramAiPostingImageSearchRound["outcome"], string> = {
  SELECTED: "Изображение выбрано",
  NO_RESULTS: "Нет новых результатов",
  NO_USABLE_IMAGES: "Нет подходящих файлов",
  NO_MATCH: "Кандидаты не прошли проверку",
  REVIEW_UNAVAILABLE: "Проверка недоступна",
};

function operationLabel(operation: Publication["operations"][number], number: number) {
  if (operation.textStep === "SHORTEN") return "Сокращение подписи";
  switch (operation.mediaStep) {
    case "SEARCH_REVIEW": return "Оценка найденных изображений";
    case "REFERENCE_REVIEW": return "Анализ референсов";
    case "GENERATE": return "Генерация изображения";
  }
  if (operation.category === "TELEGRAM_POSTING_IMAGE") return "Генерация изображения";
  if (operation.category === "TELEGRAM_POSTING_REVIEW" && operation.stage === "image")
    return "Визуальная проверка";
  return operation.stage === "planning" ? "Общая операция пачки" : `Запрос ${number}`;
}

export function AiPostingPublicationCosts({ post }: { post: Publication }) {
  const total = totalCost(post.costs);
  const mediaSearch = post.mediaSearch;
  return (
    <details className="rounded-lg border border-neutral-800 p-3">
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
        <span>Модели и расходы</span>
        <strong className="text-neutral-200">
          Итого: {total === null ? "стоимость не рассчитана" : money(total)}
        </strong>
      </summary>
      <div className="mt-3 space-y-3 text-xs text-neutral-300">
        {Object.entries(stages).map(([stage, label]) => {
          const operations = post.operations.filter((operation) => operation.stage === stage);
          const attempts = operations.filter((operation) => operation.textStep !== "SHORTEN").length;
          return (
            <section key={stage} aria-label={label} className="space-y-1 border-t border-neutral-800 pt-2">
              <h4 className="flex flex-wrap justify-between gap-2 font-semibold text-neutral-100">
                <span>{label}{stage === "text" && attempts > 0 && ` · Попыток: ${attempts}`}</span>
                <span>{money(post.costs[stage])}</span>
              </h4>
              {operations.map((operation, index) => (
                <div key={index} className="space-y-1 break-words">
                  <p>
                    {operationLabel(operation, index + 1)}
                    {operation.attempt !== undefined && stage !== "planning" && ` · попытка ${operation.attempt}`}
                    {" · "}{operation.model}{" · "}
                    {stage === "planning" ? "за всю пачку " : null}
                    {operation.pricingStatus === "NOT_SENT" && operation.actualCost === null
                      ? "$0 (не отправлен)"
                      : money(operation.actualCost)}
                    {operation.status !== "SUCCEEDED" && ` · ${operation.status}`}
                    {operation.editorialOutcome === "REVISE" && " · на доработку"}
                    {operation.editorialOutcome === "APPROVED" && " · принято"}
                    {operation.editorialOutcome === "INVALID" && " · некорректный ответ проверки"}
                  </p>
                  {(operation.inputTokens != null || operation.outputTokens != null || operation.cachedInputTokens != null) && (
                    <p className="text-neutral-400">
                      Токены · вход {operation.inputTokens ?? "—"}
                      {operation.cachedInputTokens != null && ` · из кэша ${operation.cachedInputTokens}`}
                      {" · выход "}{operation.outputTokens ?? "—"}
                    </p>
                  )}
                  {operation.editorialNote && <p className="text-neutral-400">{operation.editorialNote}</p>}
                </div>
              ))}
              {stage === "image" && mediaSearch && (
                <div className="space-y-2 pt-1">
                  {mediaSearch.brief && <p className="break-words text-neutral-400">Критерии поиска · {mediaSearch.brief}</p>}
                  {mediaSearch.rounds.map((round, index) => (
                    <div key={index} className="space-y-1 rounded-md bg-neutral-900 p-2">
                      <p className="font-medium">Поиск {index + 1} · {searchOutcome[round.outcome]}</p>
                      {round.queries.map((query, queryIndex) => (
                        <p key={queryIndex} className="break-words text-neutral-400">
                          {query.catalog === "wordpress-photos" ? "WordPress Photo Directory"
                            : query.catalog === "wikimedia" ? "Wikimedia Commons" : "Openverse / Wikimedia Commons"}
                          {" · "}{query.text}{" · стр. "}{query.page}
                          {query.unavailable ? " · каталог недоступен" : ` · результатов: ${query.candidates}`}
                        </p>
                      ))}
                      <p>Загружено для проверки: {round.inspected} · пригодных: {round.usable}</p>
                      {round.observation && <p className="break-words">{round.observation}</p>}
                    </div>
                  ))}
                </div>
              )}
              {stage === "image" && !mediaSearch && post.imageSearchQuery && post.mediaMode !== "ai" && (
                <p className="break-words text-neutral-400">Запрос · {post.imageSearchQuery}</p>
              )}
              {stage === "image" && post.imagePrompt && (post.mediaMode === "ai" || post.imageSourceId === "openai-image-generation") && (
                <p className="break-words text-neutral-400">Описание для генерации · {post.imagePrompt}</p>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
}
