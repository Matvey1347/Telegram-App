import { NextRequest, NextResponse } from "next/server";
import { isAppLocale } from "@telegram-system/shared";
import { APP_LOCALE_COOKIE } from "@/i18n/types";

export function proxy(request: NextRequest) {
  const locale = request.nextUrl.searchParams.get("locale");
  if (!isAppLocale(locale)) return NextResponse.next();

  const requestHeaders = new Headers(request.headers);
  const cookies = request.cookies
    .getAll()
    .filter(({ name }) => name !== APP_LOCALE_COOKIE);
  requestHeaders.set(
    "cookie",
    [
      ...cookies.map(({ name, value }) => `${name}=${value}`),
      `${APP_LOCALE_COOKIE}=${locale}`,
    ].join("; "),
  );
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.set(APP_LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 31_536_000,
    sameSite: "lax",
  });
  return response;
}

export const config = { matcher: "/reset-password" };
