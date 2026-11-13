import type { AiPostingFeedbackSuggestion } from "./ai-posting-feedback-suggestion";

export type Publication = {
  topic: string;
  title: string;
  text: string;
  imageUrl: string | null;
  imageSourceId: string | null;
  savedPostId: string | null;
  status: string;
  rejectionReason: string | null;
  format: string;
  category: string;
  mediaReadiness?: "READY" | "MISSING" | "FAILED";
  mediaFailureCode?: string;
  imageCostUnknown?: boolean;
  costs: Record<string, string | null>;
  operations: Array<{
    stage: string;
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

export type TestRun = {
  id: string;
  version: number;
  status: string;
  settingsVersion: number;
  requestedCount?: number;
  createdAt: string;
  publications: Publication[];
  generated?: Publication[];
  sourceDiagnostics?: SourceDiagnostic[];
  failures: Array<{ topic?: string; code: string; reasons?: string[] }>;
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
  planning: "Подбираю темы",
  text: "Пишу текст",
  review: "Проверяю текст",
  image: "Подбираю медиа",
};

export function failureStageLabel(code: string) {
  if (/^AI_POSTING_PLANNING_/.test(code)) return "план тем";
  if (/^AI_POSTING_TEXT_/.test(code)) return "генерация текста";
  if (/^AI_POSTING_REVIEW_/.test(code)) return "проверка текста";
  if (/^AI_POSTING_IMAGE_/.test(code)) return "подготовка медиа";
  if (code === "AI_POSTING_TOPIC_REPETITION") return "подбор тем";
  return "подготовка публикации";
}

export const failureMessage: Record<string, string> = {
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
  AI_POSTING_IMAGE_PROVIDER_FAILED: "Не удалось создать медиа у AI-провайдера.",
  AI_POSTING_IMAGE_STORAGE_FAILED: "Не удалось сохранить медиа в медиатеке.",
  AI_POSTING_NO_DRAFTS_CREATED:
    "AI не смог подготовить ни одной публикации. Откройте запуск ниже: там указаны причины и замечания проверки.",
  AI_POSTING_GENERATION_FAILED:
    "Генерация не завершилась. Откройте запуск ниже, чтобы увидеть этап и точную причину.",
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
  return { root, runs: [...root, "test-runs"] as const };
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
