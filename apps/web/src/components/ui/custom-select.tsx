"use client";

import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";
import { OptionIcon, floatingMenuStyle } from "./select-shared";
import { overlayPortalHost } from "./overlay-portal-host";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { createPortal } from "react-dom";
import { uiCopy, type UiLocale } from "@/lib/ui-i18n";
import { type ResolvedEmoji } from "@telegram-system/shared";
import { useOptionalI18n } from "@/providers/i18n-provider";

type SelectOption = {
  value: string;
  label: string;
  labelContent?: React.ReactNode;
  meta?: string;
  iconUrl?: string;
  iconEmoji?: string;
  iconPremium?: boolean;
  iconPresentation?: ResolvedEmoji;
  iconFallback?: string;
  icon?: React.ReactNode;
  tone?: "success" | "warning" | "danger" | "muted" | "info";
  badgeClassName?: string;
};

export function CustomSelect({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = "Select",
  disabled = false,
  dropdownDirection = "down",
  searchable = true,
  dropdownClassName = "",
  uiLocale,
  onSearchChange,
  searchPlaceholder,
  onOpen,
  loading = false,
  loadingLabel = "Loading options…",
  canCreateOption,
  createOptionLabel,
  onCreateOption,
  className = "",
}: {
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  dropdownDirection?: "up" | "down";
  searchable?: boolean;
  dropdownClassName?: string;
  uiLocale?: UiLocale;
  onSearchChange?: (search: string) => void;
  searchPlaceholder?: string;
  onOpen?: () => void;
  loading?: boolean;
  loadingLabel?: string;
  canCreateOption?: (search: string) => boolean;
  createOptionLabel?: (search: string) => React.ReactNode;
  onCreateOption?: (search: string) => void | Promise<void>;
  className?: string;
}) {
  const i18n = useOptionalI18n(),
    ui = uiCopy(uiLocale ?? i18n?.locale);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] =
    useState<React.CSSProperties | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const selected = options.find((o) => o.value === value);
  const showSearch =
    searchable &&
    (options.length > 5 ||
      Boolean(onSearchChange) ||
      Boolean(searchPlaceholder) ||
      Boolean(onCreateOption));
  const filteredOptions = showSearch
    ? options.filter((option) =>
        `${option.label} ${option.meta ?? ""} ${option.value}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      )
    : options;
  const normalizedSearch = search.trim();
  const showCreateOption = Boolean(
    normalizedSearch &&
    onCreateOption &&
    (canCreateOption?.(normalizedSearch) ?? true),
  );
  const resetSearch = useCallback(() => {
    setSearch("");
    onSearchChange?.("");
  }, [onSearchChange]);
  const createTypedOption = () => {
    if (!showCreateOption || !onCreateOption) return;
    const typedValue = normalizedSearch;
    setOpen(false);
    resetSearch();
    void Promise.resolve(onCreateOption(typedValue)).catch(() => undefined);
  };
  const pickFirstFilteredOption = () => {
    const candidate = normalizedSearch ? filteredOptions[0] : options[0];
    if (!candidate) {
      createTypedOption();
      return;
    }
    onChange(candidate.value);
    setOpen(false);
    resetSearch();
  };

  useDismissiblePopover({ open, onDismiss: () => { setOpen(false); resetSearch(); }, triggerRef: rootRef, contentRef: dropdownRef });

  useLayoutEffect(() => {
    if (!open) return;

    const updateDropdownStyle = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      setPortalHost(overlayPortalHost(trigger));
      setDropdownStyle(
        floatingMenuStyle(trigger.getBoundingClientRect(), {
          direction: dropdownDirection === "up" ? "up" : "auto",
          maxMenuHeight: 320,
        }),
      );
    };

    updateDropdownStyle();
    window.addEventListener("resize", updateDropdownStyle);
    window.addEventListener("scroll", updateDropdownStyle, true);
    window.visualViewport?.addEventListener("resize", updateDropdownStyle);
    window.visualViewport?.addEventListener("scroll", updateDropdownStyle);
    return () => {
      window.removeEventListener("resize", updateDropdownStyle);
      window.removeEventListener("scroll", updateDropdownStyle, true);
      window.visualViewport?.removeEventListener("resize", updateDropdownStyle);
      window.visualViewport?.removeEventListener("scroll", updateDropdownStyle);
    };
  }, [dropdownDirection, open]);

  const toneClass = (tone?: SelectOption["tone"]) =>
    tone === "success"
      ? "text-emerald-300"
      : tone === "warning"
        ? "text-amber-300"
        : tone === "danger"
          ? "text-red-300"
          : tone === "info"
            ? "text-blue-300"
            : "text-neutral-200";

  return (
    <div ref={rootRef} className={`relative min-w-0 max-w-full ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => {
          if (open) resetSearch();
          else onOpen?.();
          setOpen(!open);
        }}
        className="flex min-h-9 w-full min-w-0 max-w-full items-center justify-between overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring disabled:opacity-50"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {loading && !selected ? (
            <LoaderCircle
              size={15}
              className="shrink-0 animate-spin text-neutral-400"
            />
          ) : selected ? (
            <OptionIcon
              iconNode={selected.icon}
              iconPresentation={selected.iconPresentation}
              iconUrl={selected.iconUrl}
              iconEmoji={selected.iconEmoji}
              premium={selected.iconPremium}
              fallback={selected.iconFallback}
            />
          ) : null}
          <span
            className={`min-w-0 truncate ${selected ? toneClass(selected.tone) : "text-neutral-400"} ${selected?.badgeClassName ?? ""}`}
          >
            {selected?.labelContent ??
              selected?.label ??
              (loading ? loadingLabel : placeholder)}
          </span>
          {selected?.meta ? (
            <bdi className="ml-auto min-w-0 max-w-[45%] shrink truncate rounded-md bg-neutral-800 px-2 py-0.5 text-xs font-normal text-neutral-400">
              {selected.meta}
            </bdi>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-neutral-400 transition-transform ${dropdownDirection === "up" && open ? "rotate-180" : ""}`}
        />
      </button>
      {open && dropdownStyle
        ? createPortal(
            <div
              ref={dropdownRef}
              className={`z-[120] flex flex-col overflow-hidden overscroll-contain rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl ${dropdownClassName}`.trim()}
              style={dropdownStyle}
            >
              {showSearch ? (
                <div className="border-b border-neutral-800 p-2">
                  <input
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      onSearchChange?.(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setOpen(false);
                        resetSearch();
                        return;
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        pickFirstFilteredOption();
                      }
                    }}
                    placeholder={searchPlaceholder ?? ui.search}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-blue-600"
                  />
                </div>
              ) : null}
              <div className="z-[120] min-h-0 flex-1 overflow-auto overscroll-contain">
                {loading ? (
                  <div
                    role="status"
                    className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-neutral-400"
                  >
                    <LoaderCircle size={15} className="animate-spin" />
                    {loadingLabel}
                  </div>
                ) : null}
                {!loading &&
                  filteredOptions.map((opt) => {
                    const isSelected = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          onChange(opt.value);
                          setOpen(false);
                          resetSearch();
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <OptionIcon
                            iconNode={opt.icon}
                            iconPresentation={opt.iconPresentation}
                            iconUrl={opt.iconUrl}
                            iconEmoji={opt.iconEmoji}
                            premium={opt.iconPremium}
                            fallback={opt.iconFallback}
                          />
                          <span
                            className={`min-w-0 truncate ${toneClass(opt.tone)} ${opt.badgeClassName ?? ""}`}
                          >
                            {opt.labelContent ?? opt.label}
                          </span>
                          {opt.meta ? (
                            <bdi className="ml-auto min-w-0 max-w-[45%] shrink truncate rounded-md bg-neutral-800/80 px-2 py-0.5 text-xs font-normal text-neutral-400">
                              {opt.meta}
                            </bdi>
                          ) : null}
                        </span>
                        {isSelected ? (
                          <Check size={14} className="text-blue-300" />
                        ) : null}
                      </button>
                    );
                  })}
                {!loading && showCreateOption ? (
                  <button
                    type="button"
                    onClick={createTypedOption}
                    className="flex w-full items-center gap-2 border-t border-neutral-800 px-3 py-2 text-left text-sm font-medium text-blue-300 hover:bg-neutral-800"
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-950 text-base leading-none"
                    >
                      +
                    </span>
                    <span className="truncate">
                      {createOptionLabel?.(normalizedSearch) ??
                        `Add ${normalizedSearch}`}
                    </span>
                  </button>
                ) : null}
                {!loading && !filteredOptions.length && !showCreateOption ? (
                  <p className="px-3 py-3 text-center text-sm text-neutral-500">
                    No options found
                  </p>
                ) : null}
              </div>
            </div>,
            portalHost ?? document.body,
          )
        : null}
    </div>
  );
}
