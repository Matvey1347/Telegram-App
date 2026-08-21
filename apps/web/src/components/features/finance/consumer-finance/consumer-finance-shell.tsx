"use client";

import { useState } from "react";
import {
  ArrowLeftRight,
  BarChart3,
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
import type { ConsumerFinanceScreen } from "./consumer-finance-screens";
import {
  isMoreScreen,
  type ConsumerFinanceAction,
  type ConsumerFinanceSurface,
} from "./consumer-finance-navigation";
import { ConsumerFinanceActionLauncher } from "./consumer-finance-action-launcher";

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
const DESKTOP = [...PRIMARY, ...SECONDARY];

export function ConsumerFinanceShell({
  surface,
  screen,
  copy,
  children,
  onNavigate,
  onAction,
  onOpenBrowser,
  openingBrowser = false,
}: {
  surface: ConsumerFinanceSurface;
  screen: ConsumerFinanceScreen;
  copy: FinanceCopy;
  children: React.ReactNode;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
  onAction: (action: ConsumerFinanceAction) => void;
  onOpenBrowser?: () => void;
  openingBrowser?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = (next: ConsumerFinanceScreen) => {
    setMoreOpen(false);
    onNavigate(next);
  };
  const navigation = (mobile: boolean) => (
    <nav
      aria-label={copy.financeNavigation}
      className={mobile ? "contents" : "space-y-1"}
    >
      {DESKTOP.map(({ id, key, Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={screen === id ? "page" : undefined}
          onClick={() => navigate(id)}
          className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${screen === id ? "bg-sky-500/15 text-sky-200" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"}`}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{copy[key]}</span>
        </button>
      ))}
    </nav>
  );

  return (
    <main
      data-finance-surface={surface}
      className="min-h-dvh bg-neutral-950 text-neutral-100"
    >
      <div
        className={`mx-auto flex min-h-dvh w-full ${surface === "browser" ? "max-w-[1600px]" : "max-w-2xl"}`}
      >
        <aside
          className={`sticky top-0 h-dvh w-64 shrink-0 border-r border-neutral-800 px-4 py-6 ${surface === "browser" ? "hidden md:flex md:flex-col" : "hidden"}`}
        >
          <div className="mb-7 px-3">
            <p className="text-xs uppercase tracking-[0.2em] text-sky-300">
              {copy.personalFinance}
            </p>
            <p className="mt-1 text-xl font-semibold">Finance</p>
          </div>
          {navigation(false)}
          <div className="mt-auto pt-6">
            <ConsumerFinanceActionLauncher copy={copy} onAction={onAction} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between border-b border-neutral-800 bg-neutral-950/95 px-4 backdrop-blur md:px-8">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-sky-300 md:hidden">
                {copy.personalFinance}
              </p>
              <h1 className="text-lg font-semibold md:text-xl">
                {screen === "home"
                  ? copy.overview
                  : screen === "ultimate"
                    ? copy.financeUltimate
                    : copy[screen]}
              </h1>
            </div>
            {surface === "telegram" && onOpenBrowser ? (
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
          </header>
          <div className="w-full px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-7 xl:px-10">
            {children}
          </div>
        </div>
      </div>

      <ConsumerFinanceActionLauncher
        compact
        showOnDesktop={surface === "telegram"}
        copy={copy}
        onAction={onAction}
      />
      <nav
        aria-label={copy.financeNavigation}
        className={`fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-neutral-800 bg-neutral-950/95 px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur ${surface === "browser" ? "md:hidden" : "mx-auto max-w-2xl"}`}
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
        <div
          className={`fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 rounded-xl border border-neutral-800 bg-neutral-900 p-2 shadow-2xl ${surface === "browser" ? "md:hidden" : "mx-auto max-w-xl"}`}
        >
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
