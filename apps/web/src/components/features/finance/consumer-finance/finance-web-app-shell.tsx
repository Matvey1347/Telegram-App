"use client";

import { useState } from "react";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import Image from "next/image";
import type { FinanceCoreCopy } from "./i18n/core";
import type { FinanceLocale } from "./i18n/core";
import type {
  ConsumerFinanceAction,
  ConsumerFinanceScreen,
} from "./consumer-finance-navigation";
import { financeScreenLabel } from "./consumer-finance-navigation";
import { ConsumerFinanceActionLauncher } from "./consumer-finance-action-launcher";
import { FinanceLanguageSelect } from "./ui/finance-language-select";
import {
  FINANCE_NAVIGATION_GROUPS,
  FinanceNavigationButton,
  FinanceNavigationGroupHeader,
  FinanceScreenIcon,
  isFinanceNavigationActive,
} from "./finance-navigation-items";
import { FinanceAccountMenu } from "./finance-account-menu";
import { FinanceMobileNavigation } from "./finance-mobile-navigation";
import styles from "./finance-navigation-groups.module.css";

export function FinanceWebAppShell({
  logoUrl,
  screen,
  copy,
  profile,
  locale,
  onLocaleChange,
  localeChanging = false,
  localeDisabled = false,
  children,
  onNavigate,
  onAction,
  onSignOut,
  signingOut = false,
}: {
  logoUrl?: string;
  screen: ConsumerFinanceScreen;
  copy: FinanceCoreCopy;
  profile?: ConsumerFinanceProfile;
  locale: FinanceLocale;
  onLocaleChange: (locale: FinanceLocale) => void;
  localeChanging?: boolean;
  localeDisabled?: boolean;
  children: React.ReactNode;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
  onAction: (action: ConsumerFinanceAction) => void;
  onSignOut: () => void;
  signingOut?: boolean;
}) {
  const title = financeScreenLabel(copy, screen);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleGroup = (groupId: string) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  return (
    <main
      data-finance-surface="browser"
      data-finance-shell="web-app"
      className="min-h-dvh bg-neutral-950 text-neutral-100"
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[1800px]">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-hidden border-r border-neutral-800 bg-neutral-950 px-4 py-5 md:flex">
          <div className="mb-5 flex shrink-0 items-center gap-3 px-3">
            <Image
              src={logoUrl || "/brand/finance.png"}
              alt=""
              width={40}
              height={40}
              unoptimized
              className="h-10 w-10 rounded-xl object-cover"
              onError={(event) => {
                event.currentTarget.src = "/brand/finance.png";
              }}
            />
            <p className="text-xl font-semibold">Finance</p>
          </div>
          <nav
            aria-label={copy.financeNavigation}
            className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1 [scrollbar-color:#3a3a3a_transparent] [scrollbar-width:thin]"
          >
            {FINANCE_NAVIGATION_GROUPS.map((group) => {
              const collapsed = collapsedGroups.has(group.id);
              const controls = `finance-sidebar-group-${group.id}`;
              return (
                <section key={group.id} className="mb-2 last:mb-0">
                  <FinanceNavigationGroupHeader
                    group={group}
                    label={copy[group.key]}
                    collapsed={collapsed}
                    controls={controls}
                    onToggle={() => toggleGroup(group.id)}
                  />
                  <div
                    id={controls}
                    aria-hidden={collapsed}
                    inert={collapsed ? true : undefined}
                    className={`${styles.groupBody} ${collapsed ? styles.groupBodyCollapsed : ""}`}
                  >
                    <div className={`${styles.groupBodyInner} space-y-0.5`}>
                      {group.items.map((item) => (
                        <FinanceNavigationButton
                          key={item.id}
                          item={item}
                          label={copy[item.key]}
                          active={isFinanceNavigationActive(screen, item.id)}
                          onClick={() => onNavigate(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 px-4 py-3 backdrop-blur md:px-8 xl:px-10">
            <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <FinanceScreenIcon screen={screen} />
                <h1 className="truncate text-xl font-semibold md:text-2xl">
                  {title}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <ConsumerFinanceActionLauncher
                  copy={copy}
                  onAction={onAction}
                />
                <FinanceLanguageSelect
                  copy={copy}
                  value={locale}
                  onChange={onLocaleChange}
                  disabled={localeChanging || localeDisabled}
                />
                {profile ? (
                  <FinanceAccountMenu
                    profile={profile}
                    copy={copy}
                    screen={screen}
                    signingOut={signingOut}
                    onNavigate={onNavigate}
                    onSignOut={onSignOut}
                  />
                ) : null}
              </div>
            </div>
          </header>
          <div className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-5 md:px-8 md:py-7 xl:px-10">
            {children}
          </div>
        </div>
      </div>
      <FinanceMobileNavigation
        screen={screen}
        copy={copy}
        onNavigate={onNavigate}
      />
    </main>
  );
}
