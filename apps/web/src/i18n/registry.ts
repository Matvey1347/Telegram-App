import type { I18nNamespace } from "@/i18n/catalog";

export const FEATURE_I18N_REGISTRY = {
  auth: {
    base: ["common", "auth"],
    routes: {},
    lazy: {},
  },
  account: {
    base: ["common", "navigation", "account"],
    routes: {},
    lazy: {},
  },
  posts: {
    base: ["common", "navigation", "ad-sales/common", "telegram/posts/common"],
    routes: {
      editor: ["telegram/posts/editor"],
      calendar: ["telegram/posts/calendar"],
      groups: ["telegram/posts/groups"],
    },
    lazy: {
      import: ["telegram/posts/import"],
    },
  },
} as const satisfies Record<
  string,
  {
    base: readonly I18nNamespace[];
    routes: Record<string, readonly I18nNamespace[]>;
    lazy: Record<string, readonly I18nNamespace[]>;
  }
>;

export function telegramPostsNamespaces(pathname: string): I18nNamespace[] {
  const route = pathname.endsWith("/calendar")
    ? "calendar"
    : pathname.endsWith("/groups")
      ? "groups"
      : "editor";
  return [
    ...FEATURE_I18N_REGISTRY.posts.base,
    ...FEATURE_I18N_REGISTRY.posts.routes[route],
  ];
}

export function namespacesForPath(pathname: string): I18nNamespace[] {
  if (
    ["/login", "/register", "/forgot-password", "/reset-password"].includes(
      pathname,
    )
  ) {
    return [...FEATURE_I18N_REGISTRY.auth.base];
  }
  if (pathname === "/account") {
    return [...FEATURE_I18N_REGISTRY.account.base];
  }
  return pathname.startsWith("/telegram-posts")
    ? telegramPostsNamespaces(pathname)
    : ["common", "navigation"];
}
