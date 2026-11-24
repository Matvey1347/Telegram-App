"use client";

import { ChevronRight, Headphones } from "lucide-react";
import type { MouseEvent } from "react";

const labels: Record<string, string> = {
  uk: "Підтримка",
  en: "Support",
  ru: "Поддержка",
};

export function GroshlySupportLink({
  username,
  language,
  inTelegram,
}: {
  username?: string;
  language: string;
  inTelegram: boolean;
}) {
  const label = labels[language] ?? labels.uk;
  if (!username) {
    const unavailable =
      language === "en"
        ? "Temporarily unavailable"
        : language === "ru"
          ? "Временно недоступна"
          : "Тимчасово недоступна";
    return (
      <div className="setting-row" aria-disabled="true">
        <Headphones size={21} aria-hidden />
        <span>{label}</span>
        <small className="muted">{unavailable}</small>
      </div>
    );
  }

  const href = `https://t.me/${username}`;

  function openInTelegram(event: MouseEvent<HTMLAnchorElement>) {
    const webApp = window.Telegram?.WebApp;
    if (
      !inTelegram ||
      !webApp?.openTelegramLink ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    try {
      webApp.openTelegramLink(href);
      event.preventDefault();
    } catch {
      // An older Telegram client can use the same link through the browser.
    }
  }

  return (
    <a
      className="setting-row"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={openInTelegram}
    >
      <Headphones size={21} aria-hidden />
      <span>{label}</span>
      <ChevronRight size={18} aria-hidden />
    </a>
  );
}
