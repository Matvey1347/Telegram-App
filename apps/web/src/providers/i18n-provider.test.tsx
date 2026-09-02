import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import postsCommonRu from "@/i18n/locales/ru/telegram/posts/common";
import postsImportEn from "@/i18n/locales/en/telegram/posts/import";
import { I18nPreloadedBoundary, I18nProvider, useI18n } from "./i18n-provider";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

function LocaleProbe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span>{locale}</span>
      <span>{t("navigation.posts")}</span>
      <span>{t("telegram.posts.count.posts", { count: 21 })}</span>
      <button type="button" onClick={() => void setLocale("ru")}>Русский</button>
    </div>
  );
}

function LazyLocaleProbe() {
  const { setLocale, t } = useI18n();
  return (
    <div>
      <span>{t("telegram.posts.import.title")}</span>
      <button type="button" onClick={() => void setLocale("ru")}>Русский</button>
    </div>
  );
}

describe("I18nProvider", () => {
  beforeEach(() => {
    document.cookie = "telegram-system-locale=; Path=/; Max-Age=0";
    document.documentElement.lang = "en";
    pathname = "/";
  });

  it("renders the server-selected locale before the first child render", () => {
    render(<I18nProvider initialLocale="ru"><LocaleProbe /></I18nProvider>);
    expect(screen.getByText("ru")).toBeInTheDocument();
    expect(screen.getByText("Публикации")).toBeInTheDocument();
    expect(screen.getByText("telegram.posts.count.posts")).toBeInTheDocument();
  });

  it("switches instantly and synchronizes the SSR locale cookie", async () => {
    render(<I18nProvider initialLocale="en"><LocaleProbe /></I18nProvider>);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Русский" })));
    expect(screen.getByText("ru")).toBeInTheDocument();
    expect(screen.getByText("Публикации")).toBeInTheDocument();
    expect(document.cookie).toContain("telegram-system-locale=ru");
    expect(document.documentElement.lang).toBe("ru");
  });

  it("uses server-preloaded route namespaces on the first render", () => {
    pathname = "/telegram-posts/channel/editor";
    render(
      <I18nProvider initialLocale="ru">
        <I18nPreloadedBoundary
          initialLocale="ru"
          catalogs={{ "telegram/posts/common": postsCommonRu }}
        >
          <LocaleProbe />
        </I18nPreloadedBoundary>
      </I18nProvider>,
    );
    expect(screen.getByText("Публикаций: 21")).toBeInTheDocument();
  });

  it("preloads an active lazy namespace before changing locale", async () => {
    pathname = "/telegram-posts/channel/editor";
    render(
      <I18nProvider
        initialLocale="en"
        preloadedCatalogs={{ "telegram/posts/import": postsImportEn }}
      >
        <LazyLocaleProbe />
      </I18nProvider>,
    );
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Русский" })));
    await waitFor(() => expect(screen.getByText("Импорт канала")).toBeInTheDocument());
    expect(screen.queryByText("telegram.posts.import.title")).not.toBeInTheDocument();
  });
});
