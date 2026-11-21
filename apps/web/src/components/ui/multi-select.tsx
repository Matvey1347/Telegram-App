"use client";

import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";
import { OptionIcon, floatingMenuStyle } from "./select-shared";
import { overlayPortalHost } from "./overlay-portal-host";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle } from "lucide-react";
import { createPortal } from "react-dom";
import { type ResolvedEmoji } from "@telegram-system/shared";
import { useOptionalI18n } from "@/providers/i18n-provider";

type MultiSelectOption = {
  value: string;
  label: string;
  selectedLabel?: string;
  icon?: React.ReactNode; iconPresentation?: ResolvedEmoji;
  iconUrl?: string;
  iconEmoji?: string;
  iconPremium?: boolean;
  iconFallback?: string;
  badgeClassName?: string;
  badgeStyle?: React.CSSProperties;
};

export function MultiSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled = false,
  className = "",
  allSelectedLabel,
  compactSelectedAfter = 2,
  canCreateOption,
  createOptionLabel,
  onCreateOption,
  creatingOption = false,
  loading = false,
  loadingLabel = "Loading options…",
  onOpen,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  allSelectedLabel?: string;
  compactSelectedAfter?: number | null;
  canCreateOption?: (search: string) => boolean;
  createOptionLabel?: (search: string) => React.ReactNode;
  onCreateOption?: (search: string) => void | Promise<void>;
  creatingOption?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onOpen?: () => void;
}) {
  const i18n = useOptionalI18n();
  const resolvedPlaceholder =
    placeholder ?? i18n?.t("common.select") ?? "Select";
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? i18n?.t("common.search") ?? "Search";
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  useDismissiblePopover({ open, onDismiss: () => { setOpen(false); setSearch(""); }, triggerRef: rootRef, contentRef: menuRef });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      setPortalHost(overlayPortalHost(trigger));
      setMenuStyle(
        floatingMenuStyle(trigger.getBoundingClientRect(), {
          maxMenuHeight: 360,
        }),
      );
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [open]);
  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedOptions = options.filter((option) =>
    selectedSet.has(option.value),
  );
  const isAllSelected =
    options.length > 0 && selectedOptions.length === options.length;
  const filteredOptions = options.filter((option) =>
    option.label
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const normalizedSearch = search.trim();
  const showCreateOption = Boolean(
    onCreateOption &&
    normalizedSearch &&
    (canCreateOption?.(normalizedSearch) ?? true),
  );
  const resolvedCreateOptionLabel =
    createOptionLabel?.(normalizedSearch) ?? `Add ${normalizedSearch}`;
  const toggleValue = (nextValue: string) => {
    onChange(
      selectedSet.has(nextValue)
        ? value.filter((item) => item !== nextValue)
        : [...value, nextValue],
    );
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 max-w-full ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen((current) => {
            if (current) setSearch("");
            return !current;
          });
        }}
        className="flex min-h-9 w-full min-w-0 max-w-full items-center justify-between overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring disabled:opacity-50"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
          {loading && !selectedOptions.length ? (
            <span className="inline-flex items-center gap-2 text-neutral-400">
              <LoaderCircle size={15} className="animate-spin" />
              {loadingLabel}
            </span>
          ) : selectedOptions.length ? (
            compactSelectedAfter != null &&
            selectedOptions.length > compactSelectedAfter ? (
              <span
                className="flex items-center -space-x-1"
                aria-label={`${selectedOptions.length} options selected`}
              >
                {selectedOptions.slice(0, 8).map((option) => (
                  <span
                    key={option.value}
                    title={option.selectedLabel ?? option.label}
                    className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-neutral-600 bg-neutral-800"
                  >
                    <OptionIcon
                      iconNode={option.icon} iconPresentation={option.iconPresentation}
                      iconUrl={option.iconUrl}
                      iconEmoji={option.iconEmoji}
                      fallback={option.iconFallback}
                    />
                  </span>
                ))}
                {selectedOptions.length > 8 ? (
                  <span className="relative flex h-6 min-w-6 items-center justify-center rounded-md border border-neutral-600 bg-neutral-800 px-1 text-[10px] text-neutral-200">
                    +{selectedOptions.length - 8}
                  </span>
                ) : null}
              </span>
            ) : isAllSelected && allSelectedLabel ? (
              <span className="text-neutral-100">{allSelectedLabel}</span>
            ) : (
              selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${option.badgeClassName ?? "border-neutral-700 bg-neutral-800 text-neutral-100"}`}
                  style={option.badgeStyle}
                >
                  <OptionIcon
                    iconNode={option.icon} iconPresentation={option.iconPresentation}
                    iconUrl={option.iconUrl}
                    iconEmoji={option.iconEmoji}
                    fallback={option.iconFallback}
                  />
                  <span className="truncate">
                    {option.selectedLabel ?? option.label}
                  </span>
                </span>
              ))
            )
          ) : (
            <span className="text-neutral-400">{resolvedPlaceholder}</span>
          )}
        </span>
        <ChevronDown size={16} className="shrink-0 text-neutral-400" />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="z-[120] flex flex-col overflow-hidden overscroll-contain rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
            >
              <div className="border-b border-neutral-800 p-2">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setOpen(false);
                      setSearch("");
                    }
                  }}
                  placeholder={resolvedSearchPlaceholder}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-blue-600"
                />
              </div>
              <div className="min-h-0 overflow-auto overscroll-contain">
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
                  filteredOptions.map((option) => {
                    const checked = selectedSet.has(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleValue(option.value)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <OptionIcon
                            iconNode={option.icon} iconPresentation={option.iconPresentation}
                            iconUrl={option.iconUrl}
                            iconEmoji={option.iconEmoji}
                            fallback={option.iconFallback}
                          />
                          <span
                            className={`truncate ${option.badgeClassName ?? ""}`}
                            style={option.badgeStyle}
                          >
                            {option.label}
                          </span>
                        </span>
                        {checked ? (
                          <Check size={14} className="text-blue-300" />
                        ) : null}
                      </button>
                    );
                  })}
                {!loading && showCreateOption ? (
                  <button
                    type="button"
                    disabled={creatingOption}
                    aria-label={
                      creatingOption
                        ? "Adding channel…"
                        : typeof resolvedCreateOptionLabel === "string"
                          ? resolvedCreateOptionLabel
                          : `Add ${normalizedSearch}`
                    }
                    onClick={() => {
                      if (!onCreateOption) return;
                      void Promise.resolve(onCreateOption(normalizedSearch))
                        .then(() => setSearch(""))
                        .catch(() => undefined);
                    }}
                    className="flex w-full items-center gap-2 border-t border-neutral-800 px-3 py-2 text-left text-sm text-blue-300 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-950 text-base">
                      +
                    </span>
                    {creatingOption
                      ? "Adding channel…"
                      : resolvedCreateOptionLabel}
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
