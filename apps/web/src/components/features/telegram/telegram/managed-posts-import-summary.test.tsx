import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import postsCommonRu from "@/i18n/locales/ru/telegram/posts/common";
import postsImportRu from "@/i18n/locales/ru/telegram/posts/import";
import { I18nProvider } from "@/providers/i18n-provider";
import { ManagedPostsImportErrors } from "./managed-posts-import-summary";

describe("ManagedPostsImportErrors", () => {
  it("localizes structured row failures and hides raw English in Russian", () => {
    render(
      <I18nProvider
        initialLocale="ru"
        preloadedCatalogs={{
          "telegram/posts/common": postsCommonRu,
          "telegram/posts/import": postsImportRu,
        }}
      >
        <ManagedPostsImportErrors
          rows={[
            {
              index: 0,
              status: "failed",
              error: "Internal title is required",
              errorCode: "TELEGRAM_POST_TITLE_REQUIRED",
              message: "failed",
            },
            {
              index: 1,
              status: "failed",
              error: "Unknown upstream failure",
              message: "failed",
            },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("Ошибки импорта (2)")).toBeInTheDocument();
    expect(screen.getByText("Строка 1: Укажите внутреннее название.")).toBeInTheDocument();
    expect(screen.getByText("Строка 2: Не удалось импортировать эту строку.")).toBeInTheDocument();
    expect(screen.queryByText(/Internal title|upstream failure/)).not.toBeInTheDocument();
  });
});
