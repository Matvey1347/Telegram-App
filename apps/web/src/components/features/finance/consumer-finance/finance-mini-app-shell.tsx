"use client";

import { useState } from "react";
import {
  BarChart3,
  ArrowLeftRight,
  ExternalLink,
  Landmark,
  LayoutGrid,
  List,
  Menu,
  Settings,
  Sparkles,
  Tags,
  WalletCards,
  X,
} from "lucide-react";
import type { FinanceCopy } from "./finance-i18n";
import type { FinanceLocale } from "./finance-i18n";
import type { ConsumerFinanceScreen } from "./consumer-finance-screens";
import {
  isMoreScreen,
  financeScreenLabel,
  type ConsumerFinanceAction,
} from "./consumer-finance-navigation";
import { ConsumerFinanceActionLauncher } from "./consumer-finance-action-launcher";
import { FinanceLanguageSelect } from "./ui/finance-language-select";

const PRIMARY = [
  { id: "home", key: "overview", Icon: Landmark },
  { id: "transactions", key: "transactions", Icon: List },
  { id: "analytics", key: "analytics", Icon: BarChart3 },
] as const;
const SECONDARY = [
  { id: "transfers", key: "transfers", Icon: ArrowLeftRight },
  { id: "accounts", key: "accounts", Icon: WalletCards },
  { id: "budget", key: "budget", Icon: LayoutGrid },
  { id: "categories", key: "categories", Icon: Tags },
  { id: "ultimate", key: "financeUltimate", Icon: Sparkles },
  { id: "settings", key: "settings", Icon: Settings },
] as const;

export function FinanceMiniAppShell({
  logoUrl,
  screen,
  copy,
  locale,
  onLocaleChange,
  localeChanging = false,
  localeDisabled = false,
  children,
  onNavigate,
  onAction,
  onOpenBrowser,
  openingBrowser = false,
  browserOpenError,
}: {
  logoUrl?: string;
  screen: ConsumerFinanceScreen;
  copy: FinanceCopy;
  locale: FinanceLocale;
  onLocaleChange: (locale: FinanceLocale) => void;
  localeChanging?: boolean;
  localeDisabled?: boolean;
  children: React.ReactNode;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
  onAction: (action: ConsumerFinanceAction) => void;
  onOpenBrowser?: () => void;
  openingBrowser?: boolean;
  browserOpenError?: string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = (next: ConsumerFinanceScreen) => {
    setMoreOpen(false);
    onNavigate(next);
  };
  return (
    <main
      data-finance-surface="telegram"
      data-finance-shell="mini-app"
      className="min-h-dvh bg-neutral-950 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-neutral-100"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl">
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <img
                src={logoUrl || "/brand/finance.png"}
                alt=""
                className="h-9 w-9 rounded-lg object-cover"
                onError={(event) => {
                  event.currentTarget.src = "/brand/finance.png";
                }}
              />
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-sky-300">
                  {copy.personalFinance}
                </p>
                <h1 className="truncate text-lg font-semibold">
                  {financeScreenLabel(copy, screen)}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <FinanceLanguageSelect
                compact
                copy={copy}
                value={locale}
                onChange={onLocaleChange}
                disabled={localeChanging || localeDisabled}
              />
              {onOpenBrowser ? (
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

      <ConsumerFinanceActionLauncher
        compact
        showOnDesktop
        copy={copy}
        onAction={onAction}
      />
      <nav
        aria-label={copy.financeNavigation}
        className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-2xl grid-cols-4 border-t border-neutral-800 bg-neutral-950/95 pb-[max(.5rem,env(safe-area-inset-bottom))] pl-[max(.25rem,env(safe-area-inset-left))] pr-[max(.25rem,env(safe-area-inset-right))] pt-1 backdrop-blur"
      >
        {PRIMARY.map(({ id, key, Icon }) => (
          <MobileItem
            key={id}
            active={screen === id}
            label={copy[key]}
            Icon={Icon}
            onClick={() => navigate(id)}
          />
        ))}
        <MobileItem
          active={isMoreScreen(screen)}
          label={copy.more}
          Icon={moreOpen ? X : Menu}
          expanded={moreOpen}
          onClick={() => setMoreOpen((value) => !value)}
        />
      </nav>
      {moreOpen ? (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-[max(.75rem,env(safe-area-inset-left))] right-[max(.75rem,env(safe-area-inset-right))] z-30 mx-auto max-w-xl rounded-xl border border-neutral-800 bg-neutral-900 p-2 shadow-2xl">
          <div className="grid grid-cols-2 gap-1">
            {SECONDARY.map(({ id, key, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => navigate(id)}
                className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-left text-sm text-neutral-200 outline-none hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <Icon size={17} className="text-sky-300" aria-hidden="true" />
                {copy[key]}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function MobileItem({
  active,
  label,
  Icon,
  expanded,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: typeof Landmark;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      aria-expanded={expanded}
      onClick={onClick}
      className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${active ? "text-sky-200" : "text-neutral-500"}`}
    >
      <Icon size={19} aria-hidden="true" />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
