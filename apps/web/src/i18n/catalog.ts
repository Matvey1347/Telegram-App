import commonEn from "@/i18n/locales/en/common";
import navigationEn from "@/i18n/locales/en/navigation";
import type authEn from "@/i18n/locales/en/auth";
import type accountEn from "@/i18n/locales/en/account";
import type postsCommonEn from "@/i18n/locales/en/telegram/posts/common";
import type postsEditorEn from "@/i18n/locales/en/telegram/posts/editor";
import type postsGroupsEn from "@/i18n/locales/en/telegram/posts/groups";
import type postsCalendarEn from "@/i18n/locales/en/telegram/posts/calendar";
import type postsImportEn from "@/i18n/locales/en/telegram/posts/import";
import type postsEditorComponentsEn from "@/i18n/locales/en/telegram/posts/editor-components";
import type adSalesCommonEn from "@/i18n/locales/en/ad-sales/common";
import {
  I18N_NAMESPACES as SHARED_I18N_NAMESPACES,
  type I18nNamespace as SharedI18nNamespace,
} from "@telegram-system/shared";

export type I18nNamespace = Exclude<
  SharedI18nNamespace,
  "telegram/system-bot" | "notifications"
>;
export const I18N_NAMESPACES = SHARED_I18N_NAMESPACES.filter(
  (namespace): namespace is I18nNamespace =>
    namespace !== "telegram/system-bot" && namespace !== "notifications",
);
export type TranslationKey =
  | keyof typeof commonEn
  | keyof typeof navigationEn
  | keyof typeof authEn
  | keyof typeof accountEn
  | keyof typeof postsCommonEn
  | keyof typeof postsEditorEn
  | keyof typeof postsGroupsEn
  | keyof typeof postsCalendarEn
  | keyof typeof postsImportEn
  | keyof typeof postsEditorComponentsEn
  | keyof typeof adSalesCommonEn;

export type CatalogModule = {
  default: Readonly<Record<string, string>>;
};

const loaders: Record<
  "en" | "ru",
  Record<I18nNamespace, () => Promise<CatalogModule>>
> = {
  en: {
    common: () => import("@/i18n/locales/en/common"),
    navigation: () => import("@/i18n/locales/en/navigation"),
    auth: () => import("@/i18n/locales/en/auth"),
    account: () => import("@/i18n/locales/en/account"),
    "ad-sales/common": () => import("@/i18n/locales/en/ad-sales/common"),
    "telegram/posts/common": () =>
      import("@/i18n/locales/en/telegram/posts/common"),
    "telegram/posts/editor": async () => {
      const [base, components] = await Promise.all([
        import("@/i18n/locales/en/telegram/posts/editor"),
        import("@/i18n/locales/en/telegram/posts/editor-components"),
      ]);
      return { default: { ...base.default, ...components.default } };
    },
    "telegram/posts/groups": () =>
      import("@/i18n/locales/en/telegram/posts/groups"),
    "telegram/posts/calendar": () =>
      import("@/i18n/locales/en/telegram/posts/calendar"),
    "telegram/posts/import": () =>
      import("@/i18n/locales/en/telegram/posts/import"),
  },
  ru: {
    common: () => import("@/i18n/locales/ru/common"),
    navigation: () => import("@/i18n/locales/ru/navigation"),
    auth: () => import("@/i18n/locales/ru/auth"),
    account: () => import("@/i18n/locales/ru/account"),
    "ad-sales/common": () => import("@/i18n/locales/ru/ad-sales/common"),
    "telegram/posts/common": () =>
      import("@/i18n/locales/ru/telegram/posts/common"),
    "telegram/posts/editor": async () => {
      const [base, components] = await Promise.all([
        import("@/i18n/locales/ru/telegram/posts/editor"),
        import("@/i18n/locales/ru/telegram/posts/editor-components"),
      ]);
      return { default: { ...base.default, ...components.default } };
    },
    "telegram/posts/groups": () =>
      import("@/i18n/locales/ru/telegram/posts/groups"),
    "telegram/posts/calendar": () =>
      import("@/i18n/locales/ru/telegram/posts/calendar"),
    "telegram/posts/import": () =>
      import("@/i18n/locales/ru/telegram/posts/import"),
  },
};

export function loadCatalog(locale: "en" | "ru", namespace: I18nNamespace) {
  return loaders[locale][namespace]();
}

export const initialCommonEnglishCatalog = commonEn;
export const initialNavigationEnglishCatalog = navigationEn;
