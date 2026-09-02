import type { PropsWithChildren, ReactElement } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import adSalesCommon from "@/i18n/locales/en/ad-sales/common";
import common from "@/i18n/locales/en/common";
import navigation from "@/i18n/locales/en/navigation";
import auth from "@/i18n/locales/en/auth";
import account from "@/i18n/locales/en/account";
import postsCalendar from "@/i18n/locales/en/telegram/posts/calendar";
import postsCommon from "@/i18n/locales/en/telegram/posts/common";
import postsEditor from "@/i18n/locales/en/telegram/posts/editor";
import postsEditorComponents from "@/i18n/locales/en/telegram/posts/editor-components";
import postsGroups from "@/i18n/locales/en/telegram/posts/groups";
import postsImport from "@/i18n/locales/en/telegram/posts/import";
import {
  I18nProvider,
  type PreloadedI18nCatalogs,
} from "@/providers/i18n-provider";

const englishCatalogs = {
  common,
  navigation,
  auth,
  account,
  "ad-sales/common": adSalesCommon,
  "telegram/posts/common": postsCommon,
  "telegram/posts/editor": { ...postsEditor, ...postsEditorComponents },
  "telegram/posts/groups": postsGroups,
  "telegram/posts/calendar": postsCalendar,
  "telegram/posts/import": postsImport,
} satisfies PreloadedI18nCatalogs;

export function TestI18nProvider({ children }: PropsWithChildren) {
  return (
    <I18nProvider initialLocale="en" preloadedCatalogs={englishCatalogs}>
      {children}
    </I18nProvider>
  );
}

export function renderWithI18n(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: TestI18nProvider, ...options });
}
