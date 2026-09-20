"use client";

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import type { FinanceCoreCopy, FinanceLocale } from "./i18n/core";
import {
  financeScreenLabel,
  type ConsumerFinanceAction,
  type ConsumerFinanceScreen,
} from "./consumer-finance-navigation";
import { ConsumerFinanceActionLauncher } from "./consumer-finance-action-launcher";
import { FinanceLanguageSelect } from "./ui/finance-language-select";
import { FinanceMobileNavigation } from "./finance-mobile-navigation";
import { FinanceAccountMenu } from "./finance-account-menu";
import financeStyles from "./ui/finance-ui.module.css";

export function FinanceMiniAppShell({
  botId,
  logoUrl,
  screen,
  copy,
  locale,
  profile,
  onLocaleChange,
  localeChanging = false,
  localeDisabled = false,
  children,
  onNavigate,
  onOpenAssistant,
  onAction,
  onSignOut,
  signingOut = false,
  onOpenBrowser,
  browserUrl,
  openingBrowser = false,
  browserOpenError,
}: {
  botId: string;
  logoUrl?: string;
  screen: ConsumerFinanceScreen;
  copy: FinanceCoreCopy;
  locale: FinanceLocale;
  profile?: ConsumerFinanceProfile;
  onLocaleChange: (locale: FinanceLocale) => void;
  localeChanging?: boolean;
  localeDisabled?: boolean;
  children: React.ReactNode;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
  onOpenAssistant?: () => void;
  onAction: (action: ConsumerFinanceAction) => void;
  onSignOut: () => void;
  signingOut?: boolean;
  onOpenBrowser?: () => boolean;
  browserUrl?: string;
  openingBrowser?: boolean;
  browserOpenError?: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <main
      data-finance-surface="telegram"
      data-finance-shell="mini-app"
      className={`${financeStyles.pwaInset} min-h-dvh bg-neutral-950 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-neutral-100`}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl">
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Image
                src={logoUrl || "/brand/finance.png"}
                alt=""
                width={36}
                height={36}
                unoptimized
                className="h-9 w-9 rounded-lg object-cover"
                onError={(event) => {
                  event.currentTarget.src = "/brand/finance.png";
                }}
              />
              <h1 className="truncate text-lg font-semibold">
                {financeScreenLabel(copy, screen)}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <FinanceLanguageSelect
                copy={copy}
                value={locale}
                onChange={onLocaleChange}
                disabled={localeChanging || localeDisabled}
              />
              {browserUrl ? (
                <a
                  href={browserUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => {
                    if (onOpenBrowser?.() === false) event.preventDefault();
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-700 px-3 text-sm text-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50"
                >
                  <ExternalLink size={17} aria-hidden="true" />
                  <span className="hidden sm:inline">{copy.openBrowser}</span>
                </a>
              ) : onOpenBrowser ? (
                <button
                  type="button"
                  disabled={openingBrowser}
                  onClick={onOpenBrowser}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-700 px-3 text-sm text-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50"
                >
                  <ExternalLink size={17} aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {openingBrowser ? copy.openingBrowser : copy.openBrowser}
                  </span>
                </button>
              ) : null}
              {profile ? (
                <FinanceAccountMenu
                  botId={botId}
                  profile={profile}
                  copy={copy}
                  screen={screen}
                  signingOut={signingOut}
                  onNavigate={onNavigate}
                  onSignOut={onSignOut}
                />
              ) : null}
            </div>
          </header>
          {browserOpenError ? (
            <p role="alert" className="px-4 pt-3 text-sm text-rose-300">
              {browserOpenError}
            </p>
          ) : null}
          <div className="w-full px-4 pb-28 pt-5">{children}</div>
        </div>
      </div>

      {!moreOpen ? (
        <ConsumerFinanceActionLauncher
          compact
          showOnDesktop
          copy={copy}
          onAction={onAction}
        />
      ) : null}
      <FinanceMobileNavigation
        screen={screen}
        copy={copy}
        onNavigate={onNavigate}
        onOpenAssistant={onOpenAssistant}
        onMoreOpenChange={setMoreOpen}
        alwaysVisible
      />
    </main>
  );
}
