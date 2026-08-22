"use client";

import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  CreditCard,
  Landmark,
  LayoutGrid,
  List,
  Settings,
  Sparkles,
  Tags,
  WalletCards,
} from "lucide-react";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import type { FinanceCopy } from "./finance-i18n";
import type { ConsumerFinanceScreen } from "./consumer-finance-screens";
import type { ConsumerFinanceAction } from "./consumer-finance-navigation";
import { financeScreenLabel } from "./consumer-finance-navigation";
import { ConsumerFinanceActionLauncher } from "./consumer-finance-action-launcher";

const NAVIGATION = [
  { id: "home", key: "overview", Icon: Landmark },
  { id: "transactions", key: "transactions", Icon: List },
  { id: "transfers", key: "transfers", Icon: ArrowLeftRight },
  { id: "accounts", key: "accounts", Icon: WalletCards },
  { id: "categories", key: "categories", Icon: Tags },
  { id: "analytics", key: "analytics", Icon: BarChart3 },
  { id: "budget", key: "budget", Icon: LayoutGrid },
  { id: "ultimate", key: "financeUltimate", Icon: Sparkles },
  { id: "reminders", key: "reminders", Icon: Bell },
  { id: "billing", key: "plan", Icon: CreditCard },
  { id: "settings", key: "settings", Icon: Settings },
] as const;

export function FinanceWebAppShell({
  screen,
  copy,
  profile,
  children,
  onNavigate,
  onAction,
}: {
  screen: ConsumerFinanceScreen;
  copy: FinanceCopy;
  profile?: ConsumerFinanceProfile;
  children: React.ReactNode;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
  onAction: (action: ConsumerFinanceAction) => void;
}) {
  const title = financeScreenLabel(copy, screen);
  return (
    <main
      data-finance-surface="browser"
      data-finance-shell="web-app"
      className="min-h-dvh bg-neutral-950 text-neutral-100"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[1800px]">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 px-4 py-5 md:flex">
          <div className="mb-5 px-3">
            <p className="text-xs uppercase tracking-[0.2em] text-sky-300">
              {copy.personalFinance}
            </p>
            <p className="mt-1 text-xl font-semibold">Finance</p>
          </div>
          <nav aria-label={copy.financeNavigation} className="space-y-0.5">
            {NAVIGATION.map(({ id, key, Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={screen === id ? "page" : undefined}
                onClick={() => onNavigate(id)}
                className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${screen === id ? "bg-sky-500/15 text-sky-200" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"}`}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{copy[key]}</span>
              </button>
            ))}
          </nav>
          {profile ? (
            <div className="mt-auto border-t border-neutral-800 px-3 pt-4 text-xs text-neutral-500">
              <p className="font-medium text-neutral-300">
                {profile.defaultCurrency} · {profile.locale.toUpperCase()}
              </p>
              <p className="mt-1 truncate">{profile.timezone}</p>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur md:px-8 xl:px-10">
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                  {copy.personalFinance}
                </p>
                <h1 className="text-xl font-semibold md:text-2xl">{title}</h1>
              </div>
              <ConsumerFinanceActionLauncher copy={copy} onAction={onAction} />
            </div>
          </header>
          <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-5 md:px-8 md:py-7 xl:px-10">
            {children}
          </div>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-800 bg-neutral-950/95 p-2 backdrop-blur md:hidden">
        <div className="flex gap-1 overflow-x-auto">
          {NAVIGATION.map(({ id, key, Icon }) => (
            <button
              key={id}
              type="button"
              aria-current={screen === id ? "page" : undefined}
              onClick={() => onNavigate(id)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-xs ${screen === id ? "bg-sky-500/15 text-sky-200" : "text-neutral-400"}`}
            >
              <Icon size={16} aria-hidden="true" />
              {copy[key]}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
