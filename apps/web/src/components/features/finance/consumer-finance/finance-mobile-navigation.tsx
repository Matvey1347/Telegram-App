"use client";

import { Landmark, Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type Ref } from "react";
import type { FinanceCoreCopy } from "./i18n/core";
import {
  isMoreScreen,
  type ConsumerFinanceScreen,
} from "./consumer-finance-navigation";
import {
  FINANCE_MORE_NAVIGATION_GROUPS,
  FINANCE_PRIMARY_NAVIGATION,
  FinanceNavigationButton,
  FinanceNavigationGroupHeader,
  isFinanceNavigationActive,
} from "./finance-navigation-items";
import motionStyles from "./finance-navigation-groups.module.css";

export function FinanceMobileNavigation({
  screen,
  copy,
  onNavigate,
  alwaysVisible = false,
}: {
  screen: ConsumerFinanceScreen;
  copy: FinanceCoreCopy;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
  alwaysVisible?: boolean;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const navigate = (next: ConsumerFinanceScreen) => {
    setMoreOpen(false);
    onNavigate(next);
  };
  const toggleGroup = (groupId: string) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  useEffect(() => {
    if (!moreOpen) return;
    const trigger = moreTriggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        sheetRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      ).filter((element) => !element.closest("[inert]"));
    window.requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      trigger?.focus();
    };
  }, [moreOpen]);

  return (
    <>
      <nav
        aria-label={copy.financeNavigation}
        className={`fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-2xl grid-cols-4 border-t border-neutral-800 bg-neutral-950/95 pb-[max(.5rem,env(safe-area-inset-bottom))] pl-[max(.25rem,env(safe-area-inset-left))] pr-[max(.25rem,env(safe-area-inset-right))] pt-1 backdrop-blur ${alwaysVisible ? "" : "md:hidden"}`}
      >
        {FINANCE_PRIMARY_NAVIGATION.map((item) => (
          <FinanceNavigationButton
            key={item.id}
            item={item}
            active={isFinanceNavigationActive(screen, item.id)}
            label={copy[item.key]}
            mobile
            onClick={() => navigate(item.id)}
          />
        ))}
        <MobileItem
          active={isMoreScreen(screen)}
          label={copy.more}
          Icon={moreOpen ? X : Menu}
          expanded={moreOpen}
          controls="finance-more-navigation"
          buttonRef={moreTriggerRef}
          onClick={() => setMoreOpen((value) => !value)}
        />
      </nav>
      {moreOpen ? (
        <>
          <div
            aria-hidden="true"
            data-finance-more-backdrop
            className={`fixed inset-0 z-30 bg-black/65 backdrop-blur-[2px] ${alwaysVisible ? "" : "md:hidden"}`}
            onClick={() => setMoreOpen(false)}
          />
          <div
            ref={sheetRef}
            id="finance-more-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={copy.more}
            data-finance-more-panel
            className={`${motionStyles.menuPanel} fixed bottom-0 left-[max(.5rem,env(safe-area-inset-left))] right-[max(.5rem,env(safe-area-inset-right))] z-40 mx-auto max-h-[min(82dvh,44rem)] max-w-xl overflow-y-auto rounded-t-3xl border border-b-0 border-sky-950 bg-[#101820]/98 px-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_70px_rgba(0,0,0,0.55)] ${alwaysVisible ? "" : "md:hidden"}`}
          >
            <div className="mb-2 flex items-center justify-end px-1">
              <button
                type="button"
                aria-label={copy.close}
                onClick={() => setMoreOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-200 outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-sky-300 motion-reduce:transition-none"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {FINANCE_MORE_NAVIGATION_GROUPS.map((group) => {
              const collapsed = collapsedGroups.has(group.id);
              const controls = `finance-more-group-${group.id}`;
              return (
                <section key={group.id} className="mb-3 last:mb-0">
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
                    className={`${motionStyles.groupBody} ${collapsed ? motionStyles.groupBodyCollapsed : ""}`}
                  >
                    <div
                      className={`${motionStyles.groupBodyInner} grid grid-cols-2 gap-1.5`}
                    >
                      {group.items.map((item) => (
                        <FinanceNavigationButton
                          key={item.id}
                          item={item}
                          active={isFinanceNavigationActive(screen, item.id)}
                          label={copy[item.key]}
                          onClick={() => navigate(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}

function MobileItem({
  active,
  label,
  Icon,
  expanded,
  controls,
  buttonRef,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: typeof Landmark;
  expanded?: boolean;
  controls?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  onClick: () => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-current={active ? "page" : undefined}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] outline-none transition active:scale-95 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-sky-300 ${active ? "text-sky-200" : "text-neutral-500"}`}
    >
      <Icon size={19} aria-hidden="true" />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}
