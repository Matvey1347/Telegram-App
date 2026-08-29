"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Search } from "lucide-react";
import { emojiIcons, type EmojiCategory } from "@/lib/emoji-icons";
import type { ResolvedEmoji } from "@telegram-system/shared";
import type { FinanceLocale } from "../finance-i18n";
import { Button, Input } from "./finance-controls";
import { financeIconPickerCopy } from "./finance-icon-picker-i18n";

type FinanceIconPickerProps = {
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
};

const categories: EmojiCategory[] = [
  "people", "nature", "food", "activity", "travel", "objects", "symbols", "flags",
];

export function IconPicker({
  icon,
  onChange,
  onEmojiChange,
  buttonLabel,
  ariaLabel,
  className,
  iconClassName,
  compact,
  bare,
  disabled,
  uiLocale = "en",
}: FinanceIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<EmojiCategory>("people");
  const rootRef = useRef<HTMLDivElement>(null);
  const labels = financeIconPickerCopy(uiLocale);
  const selectedEmoji = icon?.type === "unicode" ? icon.value : "✨";
  const options = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const categoryIcons = emojiIcons.filter((item) => item.category === category);
    if (!query) return categoryIcons;
    return categoryIcons.filter((item) =>
      [item.name, ...item.keywords].some((term) =>
        term.toLocaleLowerCase().includes(query),
      ),
    );
  }, [category, search]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <Button
        type="button"
        variant={bare ? "secondary" : "primary"}
        disabled={disabled}
        aria-label={ariaLabel ?? (icon ? labels.changeIcon : labels.addIcon)}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={compact ? "h-9 px-2" : undefined}
      >
        <span className={`text-xl ${iconClassName ?? ""}`}>{selectedEmoji}</span>
        {buttonLabel ? <span>{buttonLabel}</span> : null}
      </Button>
      {open ? (
        <div className="absolute left-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-neutral-700 bg-neutral-950 p-3 shadow-2xl">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-neutral-500" size={16} />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={labels.searchIcon}
              className="pl-9"
              autoFocus
            />
          </label>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
            {categories.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => setCategory(value)}
                className="rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 aria-pressed:bg-blue-900/60"
              >
                {labels[value]}
              </button>
            ))}
          </div>
          <div className="mt-3 grid max-h-64 grid-cols-8 gap-1 overflow-y-auto" role="listbox">
            {options.slice(0, 320).map((item, index) => (
              <button
                key={`${item.category}:${item.name}:${index}`}
                type="button"
                role="option"
                aria-selected={selectedEmoji === item.emoji}
                title={item.name}
                onClick={() => {
                  onChange(null);
                  onEmojiChange?.(item.emoji);
                  setOpen(false);
                  setSearch("");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-neutral-800 aria-selected:bg-blue-900/60"
              >
                {item.emoji}
              </button>
            ))}
          </div>
          {!options.length ? <p className="py-6 text-center text-sm text-neutral-500">{labels.noStandardIcons}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
