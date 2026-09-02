import { describe, expect, it } from "vitest";
import { localizedApiErrorKey, safeApiErrorMessage } from "./error-localization";

function apiError(code: string, message: string, params?: Record<string, unknown>) {
  return { isAxiosError: true, response: { data: { code, message, params } } };
}

const translate = (key: string, values?: Record<string, unknown>) => ({
  "telegramPosts.errors.postNotFound": "Публикация не найдена.",
  "telegramPosts.errors.batchLimitExceeded": `Лимит: ${values?.limit}`,
  "telegram.posts.error.generic": "Не удалось выполнить действие.",
}[key] || key);

describe("Telegram Posts API error localization", () => {
  it("maps a stable backend machine code to its canonical translation key", () => {
    expect(localizedApiErrorKey(apiError("TELEGRAM_MANAGED_POST_NOT_FOUND", "Post not found")))
      .toBe("telegramPosts.errors.postNotFound");
  });

  it("never exposes an unknown backend English message in Russian", () => {
    expect(safeApiErrorMessage(apiError("NEW_SERVER_CODE", "Internal English detail"), "ru", translate, "Fallback"))
      .toBe("Не удалось выполнить действие.");
  });

  it("uses a stable code and interpolation params instead of backend prose", () => {
    expect(
      safeApiErrorMessage(
        apiError("TELEGRAM_POST_BATCH_LIMIT_EXCEEDED", "Legacy detail", { limit: 100 }),
        "ru",
        translate,
        "Fallback",
      ),
    ).toBe("Лимит: 100");
  });

  it("keeps the backend message for the English locale", () => {
    expect(safeApiErrorMessage(apiError("NEW_SERVER_CODE", "Readable error"), "en", translate, "Fallback"))
      .toBe("Readable error");
  });
});
