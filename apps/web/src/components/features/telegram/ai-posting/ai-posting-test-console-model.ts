import type { TelegramAiPostingImageSearch, TelegramAiPostingOperationContext, TelegramAiPostingRunProgress, TelegramAiPostingRunProgressRead } from "@telegram-system/shared";
import type { AiPostingFeedbackSuggestion } from "./ai-posting-feedback-suggestion";

export type Publication = {
  publicationIndex?: number;
  topic: string;
  title: string;
  text: string;
  imageUrl: string | null;
  imagePreviewUrl?: string | null;
  mediaPreference?: { id: string; name: string } | null;
  imageSourceId: string | null;
  savedPostId: string | null;
  status: string;
  rejectionReason: string | null;
  format: string;
  category: string;
  editorialMetadata?: {
    sphere?: { id: string; name: string; emoji: string; tier?: string } | null;
    rubric?: { id: string; name: string; emoji: string } | null;
    length?: { id: string; name: string; emoji: string } | null;
  };
  mediaReadiness?: "READY" | "MISSING" | "FAILED";
  mediaFailureCode?: string;
  imageCostUnknown?: boolean;
  mediaSearch?: TelegramAiPostingImageSearch;
  imageSearchQuery?: string;
  imagePrompt?: string;
  mediaMode?: "found" | "ai" | "hybrid";
  costs: Record<string, string | null>;
  operations: Array<TelegramAiPostingOperationContext & {
    stage: string;
    attempt?: number;
    category?: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    model: string;
    actualCost: string | null;
    pricingStatus?: string;
    status: string;
  }>;
  ideaSources: Array<{ id: string; type: string; value: string }>;
};

export type SourceDiagnostic = {
  sourceId: string;
  sourceType: string;
  displayValue: string;
  status: "COLLECTED" | "UNAVAILABLE" | "INELIGIBLE" | "EMPTY" | "SKIPPED";
  reason?: string;
};

export type TestRun = TelegramAiPostingRunProgressRead & {
  id: string;
  version: number;
  settingsVersion: number;
  requestedCount?: number;
  createdAt: string;
  publications: Publication[];
  generated?: Publication[];
  sourceDiagnostics?: SourceDiagnostic[];
  failures: Array<{ publicationIndex?: number; topic?: string; code: string; reasons?: string[]; retryText?: boolean }>;
  feedback: Array<
    AiPostingFeedbackSuggestion & { feedback: string; status: string }
  >;
  planningCost?: string;
  textCost?: string;
  imageCost?: string;
  reviewCost?: string;
  operations?: Array<{
    stage: string;
    status: string;
    publicationIndex?: number;
    actualCost?: string | null;
    pricingStatus?: string;
  }>;
};

export const sourceStatusLabel: Record<SourceDiagnostic["status"], string> = {
  COLLECTED: "Материал собран",
  UNAVAILABLE: "Недоступен",
  INELIGIBLE: "Отклонён проверкой доступа",
  EMPTY: "Нет полезного материала",
  SKIPPED: "Не проверялся",
};

export const generationStageLabel: Record<string, string> = {
  sources: "Собираю материалы для публикаций",
  planning: "Подбираю темы",
  text: "Пишу текст",
  review: "Проверяю текст",
  image: "Подбираю медиа",
  publication: "Публикация готова",
  "slot-failed": "Не удалось подготовить публикацию",
};

export function publicationBatchProgress(progress: TelegramAiPostingRunProgress) {
  const total = Math.max(1, progress.count);
  // Earlier snapshots saved the current slot and ready count, but not settled slots.
  const current = Math.min(total, progress.processed ?? Math.max(progress.complete, progress.publicationIndex));
  return { current, total, percent: Math.round((current / total) * 100) };
}

export function failureStageLabel(code: string) {
  if (/^AI_POSTING_PLANNING_/.test(code)) return "план тем";
  if (code === "AI_POSTING_DRAFT_INVALID" || /^AI_POSTING_TEXT_/.test(code)) return "генерация текста";
  if (/^AI_POSTING_REVIEW_/.test(code)) return "проверка текста";
  if (/^AI_POSTING_IMAGE_/.test(code)) return "подготовка медиа";
  if (code === "AI_POSTING_TOPIC_REPETITION") return "подбор тем";
  return "подготовка публикации";
}

export const failureMessage: Record<string, string> = {
  AI_POSTING_TEXT_EMPTY: "Текст пустой.",
  AI_POSTING_IMAGE_SEARCH_EXHAUSTED: "Текст сохранён. Автоматический поиск не нашёл подходящего фото.",
  AI_POSTING_DRAFT_INVALID:
    "Модель вернула ответ не в формате публикации. Текст не был сохранён.",
  AI_POSTING_TOPIC_REPETITION:
    "Не удалось подобрать достаточно разных тем. Проверьте историю и описание канала, затем попробуйте меньшую пачку.",
  AI_POSTING_TEXT_OUTPUT_INVALID:
    "Модель не вернула читаемый текст публикации. Попробуйте повторить генерацию.",
  AI_POSTING_TEXT_PROVIDER_ERROR:
    "AI-провайдер не смог подготовить текст. Проверьте настройки и доступность выбранной модели.",
  AI_POSTING_REVIEW_REJECTED:
    "Текст не прошёл редакционную проверку после нескольких попыток.",
  AI_POSTING_TELEGRAM_LENGTH: "Текст не помещается в подпись Telegram к медиа.",
  AI_POSTING_DUPLICATE_CONTENT:
    "Текст слишком похож на уже опубликованный или запланированный.",
  AI_REQUEST_BUDGET_EXCEEDED:
    "Медиа не создано: расчётный максимум запроса превышает лимит AI. Проверьте лимит стоимости запроса в настройках AI.",
  AI_POSTING_IMAGE_REFERENCE_UNAVAILABLE:
    "Не удалось загрузить референсы выбранного предпочтения. Проверьте их и повторите создание медиа.",
  AI_POSTING_IMAGE_AVATAR_UNAVAILABLE:
    "Не удалось загрузить аватар канала для изображения. Проверьте аватар канала и повторите создание медиа.",
  AI_POSTING_IMAGE_PROVIDER_FAILED: "Не удалось создать медиа у AI-провайдера.",
  AI_POSTING_IMAGE_STORAGE_UPLOAD_FAILED_TOO_BUSY: "Хранилище было перегружено. Текст готов, изображение не сохранилось.",
  AI_POSTING_IMAGE_DUPLICATE: "Это изображение уже использовалось в канале. Создайте новое медиа.",
  AI_POSTING_IMAGE_STORAGE_FAILED: "Не удалось сохранить медиа в медиатеке.",
  AI_POSTING_IMAGE_STORAGE_CONFIG_MISSING:
    "Не настроено хранилище медиа. Проверьте параметры B2 в окружении API.",
  AI_POSTING_IMAGE_STORAGE_AUTH_FAILED:
    "Хранилище медиа отклонило авторизацию API. Проверьте ключ B2 и его права.",
  AI_POSTING_IMAGE_STORAGE_BUCKET_FAILED:
    "API не смогло найти настроенную папку хранилища медиа. Проверьте имя bucket в B2.",
  AI_POSTING_IMAGE_STORAGE_CHECK_FAILED:
    "Не удалось проверить наличие файла в хранилище медиа.",
  AI_POSTING_IMAGE_STORAGE_UPLOAD_PREPARE_FAILED:
    "Хранилище не выдало адрес для загрузки медиа.",
  AI_POSTING_IMAGE_STORAGE_UPLOAD_FAILED:
    "Не удалось загрузить изображение в хранилище B2. Повторите создание медиа.",
  AI_POSTING_IMAGE_STORAGE_CONTENT_TYPE_UNSUPPORTED:
    "Формат изображения не поддерживается медиатекой.",
  AI_POSTING_NO_DRAFTS_CREATED:
    "AI не смог подготовить ни одной публикации. Откройте запуск ниже: там указаны причины и замечания проверки.",
  AI_POSTING_GENERATION_FAILED:
    "Генерация не завершилась. Причина не была сохранена; попробуйте перегенерировать публикацию.",
};

export function resolveTestConsoleError(error: unknown) {
  const responseErrorMessage = (
    error as {
      response?: { status?: number; data?: { message?: unknown } };
    } | null
  )?.response?.data?.message;
  const message =
    typeof responseErrorMessage === "string"
      ? responseErrorMessage
      : error instanceof Error
        ? error.message
        : responseErrorMessage;
  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status;
  const code =
    typeof message === "string"
      ? message
      : message && typeof message === "object" && "code" in message
        ? String((message as { code: unknown }).code)
        : "";
  return { code, status, message };
}

export const publicationStatus: Record<string, string> = {
  PENDING: "Ожидает проверки",
  APPROVED: "Одобрено",
  EDITED: "Текст изменён",
  REJECTED: "Отклонено",
  SAVED_DRAFT: "Черновик сохранён",
};

export function mediaReadiness(post: Publication) {
  if (!post.imageUrl)
    return post.mediaReadiness === "FAILED" ? "FAILED" : "MISSING";
  return post.mediaReadiness ?? "READY";
}

export function visibleLengthBand(markup: string) {
  const visible = markup
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
  const length = [...visible].length;
  return {
    length,
    band: length < 400 ? "Короткий" : length <= 1000 ? "Средний" : "Длинный",
  };
}

export const aiPostingTestRunKeys = (id: string) => {
  const root = ["telegram-ai-posting", id] as const;
  return { root, runs: [...root, "test-runs"] as const, progress: (runId: string) => [...root, "run-progress", runId] as const };
};

export function money(value: string | null | undefined) {
  return value === null || value === undefined
    ? "UNKNOWN/UNPRICED"
    : `$${value}`;
}

export function addMoney(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  )
    return null;
  return addDecimalStrings([left, right]);
}

export function totalCost(costs: Record<string, string | null>) {
  const values = ["planning", "text", "image", "review"].map(
    (stage) => costs[stage],
  );
  if (values.some((value) => value === null || value === undefined))
    return null;
  return addDecimalStrings(values as string[]);
}

export function failedPublicationCost(run: TestRun, index: number) {
  const operations = run.operations?.filter((operation) => operation.publicationIndex === index);
  if (!operations?.length) return undefined;
  return operations.some((operation) => operation.actualCost == null && operation.pricingStatus !== "NOT_SENT")
    ? null
    : addDecimalStrings(operations.map((operation) => operation.actualCost ?? "0"));
}

function addDecimalStrings(values: string[]) {
  const scale = 12;
  const factor = BigInt(10) ** BigInt(scale);
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ""] = value.split(".");
    return (
      sum +
      BigInt(whole) * factor +
      BigInt(fraction.padEnd(scale, "0").slice(0, scale))
    );
  }, BigInt(0));
  const whole = total / factor;
  const fraction = String(total % factor)
    .padStart(scale, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}
