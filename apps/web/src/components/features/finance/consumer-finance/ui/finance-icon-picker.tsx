"use client";

import { Search, Smile, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ResolvedEmoji } from "@telegram-system/shared";
import {
  emojiCategoryLabels,
  emojiIcons,
  type EmojiCategory,
} from "@/lib/emoji-icons";
import type { FinanceLocale } from "../finance-i18n";
import { FinanceIconAvatar } from "./finance-icon-avatar";

const pickerCopy = {
  en: {
    search: "Search emoji…",
    close: "Close emoji picker",
    recent: "Recent",
  },
  uk: {
    search: "Пошук емодзі…",
    close: "Закрити вибір емодзі",
    recent: "Нещодавні",
  },
  ru: {
    search: "Поиск эмодзи…",
    close: "Закрыть выбор эмодзи",
    recent: "Недавние",
  },
} as const;

const RECENT_EMOJI_KEY = "consumer-finance-recent-emojis";

function loadRecentEmoji() {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(
      localStorage.getItem(RECENT_EMOJI_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === "string")
          .slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

export function FinanceIconPicker({
  icon,
  onEmojiChange,
  buttonLabel,
  ariaLabel,
  className = "",
  iconClassName = "",
  disabled = false,
  uiLocale = "en",
}: {
  iconId?: string | null;
  icon?: ResolvedEmoji | null;
  onChange: (iconId: string | null) => void;
  onEmojiChange?: (emoji: string | null) => void;
  buttonLabel?: string;
  ariaLabel?: string;
  className?: string;
  iconClassName?: string;
  compact?: boolean;
  bare?: boolean;
  disabled?: boolean;
  allowImages?: boolean;
  onPendingChange?: (pending: boolean) => void;
  uiLocale?: FinanceLocale;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<EmojiCategory | "recent">("recent");
  const [recent, setRecent] = useState<string[]>(loadRecentEmoji);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const copy = pickerCopy[uiLocale];
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return emojiIcons.filter((item) => {
      if (category === "recent" && !recent.includes(item.emoji)) return false;
      if (category !== "recent" && item.category !== category) return false;
      if (!needle) return true;
      return `${item.emoji} ${item.name} ${item.keywords.join(" ")} ${emojiCategoryLabels[item.category]}`
        .toLocaleLowerCase()
        .includes(needle);
    });
  }, [category, recent, search]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const position = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 32);
      setPanelStyle({
        position: "fixed",
        width,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
        top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 420)),
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !panelRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? buttonLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 hover:bg-neutral-800 focus:ring disabled:opacity-50"
      >
        <FinanceIconAvatar
          icon={icon}
          label={buttonLabel}
          className={iconClassName}
          bordered={false}
        />
        {buttonLabel ? <span>{buttonLabel}</span> : null}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={buttonLabel}
              style={panelStyle}
              className="z-[70] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
            >
              <div className="flex items-center gap-2 border-b border-neutral-800 p-3">
                <Search size={16} className="text-neutral-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={copy.search}
                  className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"
                />
                <button
                  type="button"
                  aria-label={copy.close}
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex gap-1 overflow-x-auto border-b border-neutral-800 p-2">
                <button
                  type="button"
                  aria-label={copy.recent}
                  title={copy.recent}
                  onClick={() => setCategory("recent")}
                  className={`rounded-md p-2 ${category === "recent" ? "bg-blue-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}
                >
                  <Smile size={16} />
                </button>
                {(Object.keys(emojiCategoryLabels) as EmojiCategory[]).map(
                  (value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCategory(value)}
                      className={`whitespace-nowrap rounded-md px-2 py-1.5 text-xs ${category === value ? "bg-blue-600 text-white" : "text-neutral-400 hover:bg-neutral-800"}`}
                    >
                      {emojiCategoryLabels[value]}
                    </button>
                  ),
                )}
              </div>
              <div className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto p-3">
                {visible.map((item) => (
                  <button
                    key={`${item.category}:${item.name}:${item.emoji}`}
                    type="button"
                    title={item.name}
                    aria-label={item.name}
                    onClick={() => {
                      onEmojiChange?.(item.emoji);
                      setRecent((current) => {
                        const next = [
                          item.emoji,
                          ...current.filter((emoji) => emoji !== item.emoji),
                        ].slice(0, 12);
                        localStorage.setItem(
                          RECENT_EMOJI_KEY,
                          JSON.stringify(next),
                        );
                        return next;
                      });
                      setOpen(false);
                      setSearch("");
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-xl hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export { FinanceIconPicker as IconPicker };
