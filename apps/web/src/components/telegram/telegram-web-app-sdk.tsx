"use client";

import Script from "next/script";

export const TELEGRAM_WEB_APP_SDK_READY_EVENT = "telegram-web-app-sdk-ready";
export const TELEGRAM_WEB_APP_SDK_FAILED_EVENT = "telegram-web-app-sdk-failed";

export function TelegramWebAppSdk() {
  return (
    <Script
      id="telegram-web-app-sdk"
      src="https://telegram.org/js/telegram-web-app.js?63"
      strategy="afterInteractive"
      onLoad={() => window.dispatchEvent(new Event(TELEGRAM_WEB_APP_SDK_READY_EVENT))}
      onError={() => window.dispatchEvent(new Event(TELEGRAM_WEB_APP_SDK_FAILED_EVENT))}
    />
  );
}
