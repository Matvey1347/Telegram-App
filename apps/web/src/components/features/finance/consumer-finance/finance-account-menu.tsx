"use client";

import { CreditCard, LogOut, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ConsumerFinanceProfile } from "@telegram-system/shared";
import type { FinanceCoreCopy } from "./i18n/core";
import type { ConsumerFinanceScreen } from "./consumer-finance-navigation";
import { FinanceProfileAvatar } from "./finance-profile-avatar";

export function FinanceAccountMenu({
  profile,
  copy,
  screen,
  signingOut = false,
  onNavigate,
  onSignOut,
}: {
  profile: ConsumerFinanceProfile;
  copy: FinanceCoreCopy;
  screen: ConsumerFinanceScreen;
  signingOut?: boolean;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    rootRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = Array.from(
        rootRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not(:disabled)',
        ) ?? [],
      );
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowUp"
              ? (current - 1 + items.length) % items.length
              : (current + 1) % items.length;
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const navigate = (next: ConsumerFinanceScreen) => {
    setOpen(false);
    onNavigate(next);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={copy.openAccountMenu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full outline-none transition hover:ring-2 hover:ring-neutral-700 focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <FinanceProfileAvatar profile={profile} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 p-1.5 shadow-2xl"
        >
          <div className="border-b border-neutral-800 px-2 py-2.5">
            <FinanceProfileAvatar profile={profile} showName />
          </div>
          <AccountMenuItem
            active={screen === "profile"}
            label={copy.accountCenter}
            Icon={UserRound}
            onClick={() => navigate("profile")}
          />
          <AccountMenuItem
            active={screen === "billing"}
            label={copy.plan}
            Icon={CreditCard}
            onClick={() => navigate("billing")}
          />
          <div className="mt-1 border-t border-neutral-800 pt-1">
            <AccountMenuItem
              label={signingOut ? copy.signingOut : copy.signOut}
              Icon={LogOut}
              disabled={signingOut}
              onClick={onSignOut}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AccountMenuItem({
  label,
  Icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  Icon: typeof UserRound;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`mt-1 flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-50 ${active ? "bg-sky-500/15 text-sky-200" : "text-neutral-200 hover:bg-neutral-800"}`}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}
