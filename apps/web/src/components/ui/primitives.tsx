"use client";

import {
  Children,
  PropsWithChildren,
  forwardRef,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CalendarDays,
  Check,
  CircleCheck,
  CircleX,
  Clock3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Eye,
  EyeOff,
  LoaderCircle,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { Modal } from "./modal";
import { uiCopy, type UiLocale } from "@/lib/ui-i18n";
import { currencyPresentation } from "@telegram-system/shared";
import type { ResolvedEmoji } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
export { Modal } from "./modal";
export { MasonryGrid } from "./masonry-grid";

export type ToastItem = {
  id: number | string;
  message: string;
  title?: string;
  tone?: "success" | "error" | "info" | "loading";
  iconEmoji?: string;
  iconUrl?: string;
  progress?: { current: number; total: number };
  progressSummary?: { successful: number; failed: number };
  cancelable?: boolean;
  details?: string;
};

export function Button({
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
}) {
  const styles = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white",
    secondary: "bg-neutral-700 hover:bg-neutral-600 text-white",
    danger: "bg-red-600 hover:bg-red-500 text-white",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${props.className ?? ""}`}
    />
  );
}

export function ToggleRow({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = "",
  activeTone = "emerald",
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  activeTone?: "blue" | "emerald";
}) {
  const activeClass =
    activeTone === "blue"
      ? "border-blue-500/70 bg-blue-500/20"
      : "border-emerald-500/70 bg-emerald-500/20";
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 ${className}`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{label}</p>
        {description ? (
          <p className="mt-1 text-sm text-neutral-400">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition disabled:opacity-50 ${
          checked ? activeClass : "border-neutral-700 bg-neutral-900"
        }`}
        aria-pressed={checked}
        aria-label={label}
      >
        <span
          className={`absolute h-6 w-6 rounded-full bg-white transition ${
            checked ? "left-7" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, type, ...props }, ref) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";
  const input = (
    <input
      {...props}
      ref={ref}
      type={isPassword && passwordVisible ? "text" : type}
      className={`min-h-9 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 focus:ring ${isPassword ? "pr-11" : ""} ${className ?? ""}`}
    />
  );

  if (!isPassword) return input;
  return (
    <span className="relative block">
      {input}
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => setPasswordVisible((visible) => !visible)}
        className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50"
        aria-label={passwordVisible ? "Hide password" : "Show password"}
        aria-pressed={passwordVisible}
      >
        {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  );
});

export function normalizeTimeInputValue(value: string) {
  const sanitized = value.replace(/[^\d:.\s]/g, "").replace(/\s+/g, "");
  if (!sanitized) return "";
  const normalized = sanitized.replace(/\./g, ":");
  if (!normalized.includes(":")) {
    if (normalized.length <= 2) return normalized;
    return `${normalized.slice(0, 2)}:${normalized.slice(2, 4)}`;
  }
  const [hours = "", minutes = ""] = normalized.split(":", 2);
  return `${hours.slice(0, 2)}:${minutes.slice(0, 2)}`;
}

export function canonicalizeTimeInputValue(value: string) {
  const normalized = normalizeTimeInputValue(value);
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function isValidTimeInputValue(value: string) {
  return canonicalizeTimeInputValue(value) !== null;
}

export function TimeInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, onBlur, onChange, placeholder, ...restProps } = props;
  return (
    <div className="relative">
      <input
        {...restProps}
        type="text"
        inputMode="numeric"
        maxLength={5}
        placeholder={placeholder ?? "HH:MM"}
        onChange={(event) => {
          event.target.value = normalizeTimeInputValue(event.target.value);
          onChange?.(event);
        }}
        onBlur={(event) => {
          const canonical = canonicalizeTimeInputValue(event.target.value);
          if (canonical !== event.target.value) {
            event.target.value = canonical ?? "12:00";
            onChange?.(event);
          }
          onBlur?.(event);
        }}
        className={`min-h-9 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 pr-11 text-sm text-white outline-none ring-blue-500 focus:ring ${className ?? ""}`}
      />
      <Clock3
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300"
      />
    </div>
  );
}

function OptionIcon({
  iconPresentation,
  iconUrl,
  iconEmoji,
  premium,
  fallback,
}: {
  iconPresentation?: ResolvedEmoji;
  iconUrl?: string;
  iconEmoji?: string;
  premium?: boolean;
  fallback?: string;
}) {
  if (iconPresentation)
    return (
      <IconAvatar
        icon={iconPresentation}
        size="xs"
        bordered={false}
        className="!rounded-md"
      />
    );
  if (iconUrl)
    return (
      <img
        src={iconUrl}
        alt=""
        className="h-5 w-5 shrink-0 rounded-md object-cover"
      />
    );
  if (iconEmoji)
    return (
      <span
        className={`relative flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none ${premium ? "rounded-md ring-1 ring-sky-400/70" : ""}`}
        title={premium ? "Telegram Premium emoji" : undefined}
      >
        {iconEmoji}
        {premium ? (
          <span
            className="absolute -right-1 -top-1 text-[8px] leading-none text-sky-300"
            aria-label="Telegram Premium emoji"
          >
            ✦
          </span>
        ) : null}
      </span>
    );
  if (!fallback) return null;
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-[11px] font-semibold text-neutral-200">
      {fallback.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    uiLocale?: UiLocale;
    onSearchPaste?: (value: string) => boolean | Promise<boolean>;
    searchPlaceholder?: string;
  },
) {
  const ui = uiCopy(props.uiLocale);
  const financeTypeClass = (value: string) => {
    if (value === "income") return "text-emerald-300";
    if (value === "expense" || value === "expenses" || value === "expences")
      return "text-rose-300";
    return "";
  };

  const options = Children.toArray(props.children)
    .filter(isValidElement)
    .map((child: any, idx: number) => {
      const rawChildren = Children.toArray(child.props?.children);
      const label = rawChildren.length
        ? rawChildren
            .map((node: any) =>
              typeof node === "string" || typeof node === "number"
                ? String(node)
                : "",
            )
            .join("")
        : String(child.props?.children ?? "");
      const hasExplicitValue = child.props?.value !== undefined;
      const value = String(hasExplicitValue ? child.props?.value : label);
      return {
        value,
        label,
        disabled: Boolean(child.props?.disabled),
        hidden: Boolean(child.props?.hidden),
        className: child.props?.className || financeTypeClass(value),
        iconUrl: child.props?.["data-icon-url"]
          ? String(child.props["data-icon-url"])
          : undefined,
        iconEmoji: child.props?.["data-icon-emoji"]
          ? String(child.props["data-icon-emoji"])
          : undefined,
        iconFallback: child.props?.["data-icon-fallback"]
          ? String(child.props["data-icon-fallback"])
          : undefined,
        key: `${value}-${idx}`,
      };
    });

  const [internalValue, setInternalValue] = useState(
    String(props.defaultValue ?? options[0]?.value ?? ""),
  );
  const isControlled = props.value !== undefined;
  const currentValue = String(
    (isControlled ? props.value : internalValue) ?? "",
  );

  const selected = options.find((o) => o.value === currentValue);
  const menuOptions = options.filter((o) => !o.hidden);
  const showSearch = menuOptions.length > 5 || Boolean(props.onSearchPaste);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);
  const filteredMenuOptions = showSearch
    ? menuOptions.filter((option) =>
        option.label
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      )
    : menuOptions;

  const pickFirstFilteredOption = () => {
    const normalizedSearch = search.trim();
    const candidate = normalizedSearch
      ? filteredMenuOptions.find((option) => !option.disabled)
      : menuOptions.find((option) => !option.disabled);
    if (!candidate) return;
    commit(candidate.value);
    setOpen(false);
    setSearch("");
  };

  useEffect(() => {
    const onDocPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node;
      if (
        !rootRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 4;
      const padding = 8;
      const below = window.innerHeight - rect.bottom - gap - padding;
      const above = rect.top - gap - padding;
      const openUp = below < 240 && above > below;
      const maxHeight = Math.max(120, Math.min(320, openUp ? above : below));
      const width = Math.min(rect.width, window.innerWidth - padding * 2);
      const left = Math.min(
        Math.max(rect.left, padding),
        window.innerWidth - width - padding,
      );
      setMenuStyle({
        position: "fixed",
        left,
        width,
        maxHeight,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const commit = (next: string) => {
    if (!isControlled) setInternalValue(next);
    if (props.onChange) {
      props.onChange({ target: { name: props.name, value: next } } as any);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={props.disabled}
        onClick={() => {
          if (!open && props.onFocus) {
            props.onFocus({
              target: { name: props.name, value: currentValue },
            } as unknown as React.FocusEvent<HTMLSelectElement>);
          }
          setOpen((value) => {
            if (value) setSearch("");
            return !value;
          });
        }}
        className={`flex min-h-9 w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring disabled:opacity-50 ${props.className ?? ""}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <OptionIcon
              iconUrl={selected.iconUrl}
              iconEmoji={selected.iconEmoji}
              fallback={selected.iconFallback}
            />
          ) : null}
          <span
            className={`truncate ${selected ? selected.className || "text-white" : "text-neutral-400"}`}
          >
            {selected?.label || ui.select}
          </span>
        </span>
        <ChevronDown size={16} className="text-neutral-400" />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="z-[120] flex flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
            >
              {showSearch ? (
                <div className="border-b border-neutral-800 p-2">
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setOpen(false);
                        setSearch("");
                        return;
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        pickFirstFilteredOption();
                      }
                    }}
                    placeholder={props.searchPlaceholder ?? ui.search}
                    onPaste={(event) => {
                      const pasted = event.clipboardData.getData("text").trim();
                      if (!pasted || !props.onSearchPaste) return;
                      setSearch(pasted);
                      void Promise.resolve(props.onSearchPaste(pasted)).then(
                        (resolved) => {
                          if (!resolved) return;
                          setOpen(false);
                          setSearch("");
                        },
                      );
                    }}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-blue-600"
                  />
                </div>
              ) : null}
              <div className="min-h-0 flex-1 overflow-auto">
                {filteredMenuOptions.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={opt.disabled}
                    onClick={() => {
                      if (opt.disabled) return;
                      commit(opt.value);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <OptionIcon
                        iconUrl={opt.iconUrl}
                        iconEmoji={opt.iconEmoji}
                        fallback={opt.iconFallback}
                      />
                      <span className={`truncate ${opt.className}`}>
                        {opt.label}
                      </span>
                    </span>
                    {opt.value === currentValue ? (
                      <Check size={14} className="text-blue-300" />
                    ) : null}
                  </button>
                ))}
                {!filteredMenuOptions.length ? (
                  <p className="px-3 py-3 text-center text-sm text-neutral-500">
                    {ui.noOptions}
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
      <input type="hidden" name={props.name} value={currentValue} />
    </div>
  );
}

export function CurrencySelect({
  value,
  onChange,
  currencies,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  currencies: string[];
  disabled?: boolean;
}) {
  const options = Array.from(
    new Set([value, ...currencies].filter(Boolean)),
  ).sort();

  return (
    <CustomSelect
      value={value.toUpperCase()}
      onChange={(next) => onChange(next.toUpperCase())}
      disabled={disabled}
      searchable={options.length > 5}
      options={options.map((currency) => {
        const presentation = currencyPresentation(currency);
        return {
          value: presentation.code,
          label: presentation.code,
          meta: presentation.symbol,
          iconEmoji: presentation.flag,
        };
      })}
    />
  );
}

type MultiSelectOption = {
  value: string;
  label: string;
  selectedLabel?: string;
  iconUrl?: string;
  iconEmoji?: string;
  iconPremium?: boolean;
  iconFallback?: string;
};

export function MultiSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  searchPlaceholder = "Search...",
  disabled = false,
  className = "",
  allSelectedLabel,
  compactSelectedAfter = 2,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  allSelectedLabel?: string;
  compactSelectedAfter?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    const onDocPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node;
      if (
        !rootRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 4;
      const padding = 8;
      const spaceBelow = window.innerHeight - rect.bottom - gap - padding;
      const spaceAbove = rect.top - gap - padding;
      const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        120,
        Math.min(360, openUp ? spaceAbove : spaceBelow),
      );
      const width = Math.min(rect.width, window.innerWidth - padding * 2);
      const left = Math.min(
        Math.max(rect.left, padding),
        window.innerWidth - width - padding,
      );
      setMenuStyle({
        position: "fixed",
        left,
        width,
        maxHeight,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
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

  const toggleValue = (nextValue: string) => {
    onChange(
      selectedSet.has(nextValue)
        ? value.filter((item) => item !== nextValue)
        : [...value, nextValue],
    );
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((current) => {
            if (current) setSearch("");
            return !current;
          });
        }}
        className="flex min-h-9 w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring disabled:opacity-50"
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {selectedOptions.length ? (
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
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-100"
                >
                  <OptionIcon
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
            <span className="text-neutral-400">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} className="shrink-0 text-neutral-400" />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              style={menuStyle}
              className="z-[120] flex flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
            >
              <div className="border-b border-neutral-800 p-2">
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setOpen(false);
                      setSearch("");
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-blue-600"
                />
              </div>
              <div className="min-h-0 overflow-auto">
                {filteredOptions.map((option) => {
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
                          iconUrl={option.iconUrl}
                          iconEmoji={option.iconEmoji}
                          fallback={option.iconFallback}
                        />
                        <span className="truncate">{option.label}</span>
                      </span>
                      {checked ? (
                        <Check size={14} className="text-blue-300" />
                      ) : null}
                    </button>
                  );
                })}
                {!filteredOptions.length ? (
                  <p className="px-3 py-3 text-center text-sm text-neutral-500">
                    No options found
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 focus:ring ${props.className ?? ""}`}
    />
  );
}

export { DateInput, DateRangeInput } from "./date-inputs";

export function StatusPill({ value }: { value: string }) {
  const tone =
    value === "active"
      ? "bg-emerald-900/50 text-emerald-300 border-emerald-700"
      : value === "draft" || value === "planned"
        ? "bg-amber-900/40 text-amber-300 border-amber-700"
        : value === "finished"
          ? "bg-blue-900/40 text-blue-300 border-blue-700"
          : value === "cancelled" || value === "archived"
            ? "bg-red-900/40 text-red-300 border-red-700"
            : "bg-neutral-800 text-neutral-300 border-neutral-700";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {value}
    </span>
  );
}

type SelectOption = {
  value: string;
  label: string;
  meta?: string;
  iconUrl?: string;
  iconEmoji?: string;
  iconPremium?: boolean;
  iconPresentation?: ResolvedEmoji;
  iconFallback?: string;
  tone?: "success" | "warning" | "danger" | "muted" | "info";
};

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled = false,
  dropdownDirection = "down",
  searchable = true,
  dropdownClassName = "",
  uiLocale,
}: {
  value?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  dropdownDirection?: "up" | "down";
  searchable?: boolean;
  dropdownClassName?: string;
  uiLocale?: UiLocale;
}) {
  const ui = uiCopy(uiLocale);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [dropdownStyle, setDropdownStyle] =
    useState<React.CSSProperties | null>(null);
  const selected = options.find((o) => o.value === value);
  const showSearch = searchable && options.length > 5;
  const filteredOptions = showSearch
    ? options.filter((option) =>
        option.label
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      )
    : options;

  const pickFirstFilteredOption = () => {
    const normalizedSearch = search.trim();
    const candidate = normalizedSearch ? filteredOptions[0] : options[0];
    if (!candidate) return;
    onChange(candidate.value);
    setOpen(false);
    setSearch("");
  };

  useEffect(() => {
    const onDocPointerDown = (event: PointerEvent) => {
      if (!rootRef.current) return;
      const target = event.target as Node;
      if (
        !rootRef.current.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;

    const updateDropdownStyle = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 4;
      const viewportPadding = 8;
      const maxWidth = window.innerWidth - viewportPadding * 2;
      const width = Math.min(rect.width, maxWidth);
      const left = Math.min(
        Math.max(rect.left, viewportPadding),
        window.innerWidth - width - viewportPadding,
      );

      const availableBelow =
        window.innerHeight - rect.bottom - gap - viewportPadding;
      const availableAbove = rect.top - gap - viewportPadding;
      const openUp =
        dropdownDirection === "up" ||
        (availableBelow < 240 && availableAbove > availableBelow);
      const maxHeight = Math.max(
        120,
        Math.min(320, openUp ? availableAbove : availableBelow),
      );

      setDropdownStyle(
        openUp
          ? {
              position: "fixed",
              left,
              bottom: Math.max(window.innerHeight - rect.top + gap, gap),
              width,
              maxHeight,
            }
          : {
              position: "fixed",
              left,
              top: Math.min(rect.bottom + gap, window.innerHeight - gap),
              width,
              maxHeight,
            },
      );
    };

    updateDropdownStyle();
    window.addEventListener("resize", updateDropdownStyle);
    window.addEventListener("scroll", updateDropdownStyle, true);
    return () => {
      window.removeEventListener("resize", updateDropdownStyle);
      window.removeEventListener("scroll", updateDropdownStyle, true);
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
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((value) => {
            if (value) setSearch("");
            return !value;
          });
        }}
        className="flex min-h-9 w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring disabled:opacity-50"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected ? (
            <OptionIcon
              iconPresentation={selected.iconPresentation}
              iconUrl={selected.iconUrl}
              iconEmoji={selected.iconEmoji}
              premium={selected.iconPremium}
              fallback={selected.iconFallback}
            />
          ) : null}
          <span
            className={`truncate ${selected ? toneClass(selected.tone) : "text-neutral-400"}`}
          >
            {selected?.label || placeholder}
          </span>
          {selected?.meta ? (
            <bdi className="ml-auto rounded-md bg-neutral-800 px-2 py-0.5 text-xs font-normal text-neutral-400">
              {selected.meta}
            </bdi>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          className={`text-neutral-400 transition-transform ${dropdownDirection === "up" && open ? "rotate-180" : ""}`}
        />
      </button>
      {open && dropdownStyle
        ? createPortal(
            <div
              ref={dropdownRef}
              className={`z-[120] flex flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl ${dropdownClassName}`.trim()}
              style={dropdownStyle}
            >
              {showSearch ? (
                <div className="border-b border-neutral-800 p-2">
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setOpen(false);
                        setSearch("");
                        return;
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        pickFirstFilteredOption();
                      }
                    }}
                    placeholder={ui.search}
                    className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-blue-600"
                  />
                </div>
              ) : null}
              <div className="z-[120] min-h-0 flex-1 overflow-auto">
                {filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                        setSearch("");
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-800"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <OptionIcon
                          iconPresentation={opt.iconPresentation}
                          iconUrl={opt.iconUrl}
                          iconEmoji={opt.iconEmoji}
                          premium={opt.iconPremium}
                          fallback={opt.iconFallback}
                        />
                        <span className={`truncate ${toneClass(opt.tone)}`}>
                          {opt.label}
                        </span>
                        {opt.meta ? (
                          <bdi className="ml-auto rounded-md bg-neutral-800/80 px-2 py-0.5 text-xs font-normal text-neutral-400">
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
                {!filteredOptions.length ? (
                  <p className="px-3 py-3 text-center text-sm text-neutral-500">
                    No options found
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={`rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

export function Table({ children }: PropsWithChildren) {
  return (
    <div className="table-scroll w-full">
      <table className="w-max min-w-full text-left text-sm text-neutral-200">
        {children}
      </table>
    </div>
  );
}

export function EntityCard({
  title,
  children,
  actions,
  className = "",
}: PropsWithChildren<{
  title: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}>) {
  return (
    <Card className={className}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {actions}
      </div>
      <div className="space-y-1 text-sm text-neutral-300">{children}</div>
    </Card>
  );
}

export function IconButton({
  kind = "edit",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "edit" | "delete";
}) {
  return (
    <button
      {...props}
      className={`inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border p-0 ${kind === "delete" ? "border-red-700 text-red-300 hover:bg-red-950" : "border-neutral-700 text-neutral-200 hover:bg-neutral-800"} ${props.className ?? ""}`}
    >
      {kind === "delete" ? <Trash2 size={16} /> : <Pencil size={16} />}
    </button>
  );
}

export const TooltipBubble = forwardRef<
  HTMLSpanElement,
  {
    children: React.ReactNode;
    side?: "top" | "bottom";
    align?: "left" | "center" | "right";
    className?: string;
    style?: React.CSSProperties;
    arrowStyle?: React.CSSProperties;
    floating?: boolean;
  }
>(function TooltipBubble(
  {
    children,
    side = "top",
    align = "center",
    className = "",
    style,
    arrowStyle,
    floating = false,
  },
  ref,
) {
  const positionClass = floating
    ? ""
    : side === "top"
      ? "bottom-full mb-3"
      : "top-full mt-3";
  const alignClass = floating
    ? ""
    : align === "left"
      ? "left-0"
      : align === "right"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  const layerClass = floating ? "fixed" : "absolute";
  const arrowAnchorClass =
    align === "left"
      ? "left-4"
      : align === "right"
        ? "right-4"
        : "left-1/2 -translate-x-1/2";
  const arrowClass =
    side === "top"
      ? "top-full -translate-y-1/2 rotate-45 border-b border-r"
      : "bottom-full translate-y-1/2 rotate-45 border-t border-l";

  return (
    <span
      ref={ref}
      style={style}
      className={`pointer-events-none ${layerClass} z-[200] w-max max-w-[calc(100vw-2rem)] rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs leading-relaxed text-neutral-100 shadow-xl ${positionClass} ${alignClass} ${className}`}
    >
      {children}
      <span
        style={arrowStyle}
        className={`absolute h-3 w-3 border-neutral-700 bg-neutral-950 ${arrowStyle ? "" : arrowAnchorClass} ${arrowClass}`}
        aria-hidden="true"
      />
    </span>
  );
});

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  className = "",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom";
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    arrowLeft: 0,
    side,
  });

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !mounted) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const bubbleWidth = bubbleRef.current?.offsetWidth ?? 0;
    const margin = 12;
    const desiredLeft =
      align === "left"
        ? rect.left
        : align === "right"
          ? rect.right
          : rect.left + rect.width / 2;
    const minLeft =
      align === "right"
        ? margin + bubbleWidth
        : align === "center"
          ? margin + bubbleWidth / 2
          : margin;
    const maxLeft =
      align === "left"
        ? window.innerWidth - margin - bubbleWidth
        : align === "center"
          ? window.innerWidth - margin - bubbleWidth / 2
          : window.innerWidth - margin;
    const bubbleHeight = bubbleRef.current?.offsetHeight ?? 0;
    const viewportMargin = 12;
    const preferredTop = side === "top" ? rect.top - 12 : rect.bottom + 12;
    const oppositeSide = side === "top" ? "bottom" : "top";
    const oppositeTop =
      oppositeSide === "top" ? rect.top - 12 : rect.bottom + 12;
    const preferredFits =
      side === "top"
        ? preferredTop - bubbleHeight >= viewportMargin
        : preferredTop + bubbleHeight <= window.innerHeight - viewportMargin;
    const resolvedSide = preferredFits ? side : oppositeSide;
    const top = oppositeSide === "top" ? rect.top - 12 : rect.bottom + 12;
    const left = Math.max(minLeft, Math.min(maxLeft, desiredLeft));
    const bubbleLeft =
      align === "right"
        ? left - bubbleWidth
        : align === "center"
          ? left - bubbleWidth / 2
          : left;
    const triggerCenter = rect.left + rect.width / 2;
    const arrowLeft = bubbleWidth
      ? Math.max(16, Math.min(bubbleWidth - 16, triggerCenter - bubbleLeft))
      : 0;
    setPosition({
      left,
      top: resolvedSide === side ? preferredTop : top,
      arrowLeft,
      side: resolvedSide,
    });
  }, [align, content, mounted, open, side]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (bubbleRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const transform =
    align === "left"
      ? "translateX(0)"
      : align === "right"
        ? "translateX(-100%)"
        : "translateX(-50%)";

  return (
    <span
      ref={triggerRef}
      className={`inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((current) => !current)}
    >
      {children}
      {mounted && open
        ? createPortal(
            <TooltipBubble
              ref={bubbleRef}
              side={position.side}
              align={align}
              floating
              className="whitespace-normal"
              style={{
                left: position.left,
                top: position.top,
                transform:
                  position.side === "top"
                    ? `${transform} translateY(-100%)`
                    : transform,
              }}
              arrowStyle={
                position.arrowLeft
                  ? {
                      left: position.arrowLeft,
                      marginLeft: -6,
                    }
                  : undefined
              }
            >
              {content}
            </TooltipBubble>,
            document.body,
          )
        : null}
    </span>
  );
}

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  entityName,
  label = "Delete",
  description,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<unknown>;
  entityName: string;
  label?: string;
  description?: string;
}) {
  const [value, setValue] = useState("");
  const valid = useMemo(() => value === entityName, [value, entityName]);
  useEffect(() => {
    if (!open) {
      setValue("");
    }
  }, [open]);
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Confirm deletion">
      <p className="mb-2 text-sm text-neutral-300">
        Type <span className="font-semibold text-white">{entityName}</span> to
        confirm deletion.
      </p>
      {description ? (
        <p className="mb-3 text-sm text-amber-300">{description}</p>
      ) : null}
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={entityName}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setValue("");
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={!valid}
          onClick={() => {
            setValue("");
            onClose();
            void Promise.resolve(onConfirm()).catch(() => undefined);
          }}
        >
          <span className="inline-flex items-center gap-2">{label}</span>
        </Button>
      </div>
    </Modal>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div>
        <h2 className="text-2xl font-semibold sm:text-3xl">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-neutral-400 sm:text-base">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="w-full sm:w-auto [&>a]:inline-flex [&>a]:w-full [&>button]:w-full sm:[&>a]:w-auto sm:[&>button]:w-auto">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function FormField({
  label,
  required,
  error,
  children,
}: PropsWithChildren<{
  label: React.ReactNode;
  required?: boolean;
  error?: string;
}>) {
  return (
    <div className="block text-sm">
      <span className="mb-1 block text-neutral-300">
        {label}
        {required ? <span className="ml-1 text-red-400">*</span> : null}
      </span>
      {children}
      {error ? <p className="mt-1 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-sm text-red-400">{message}</p>;
}

export function ErrorState({
  text = "Something went wrong.",
}: {
  text?: string;
}) {
  return (
    <div className="rounded-lg border border-rose-700 bg-rose-950/30 p-4 text-sm text-rose-200">
      {text}
    </div>
  );
}

export function LoadingState({ text = "Loading..." }: { text?: string }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5"
      role="status"
      aria-label={text}
    >
      <span className="sr-only">{text}</span>
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </div>
    </div>
  );
}

export function TableLoadingState({
  text = "Loading...",
  columns = 4,
  rows = 5,
}: {
  text?: string;
  columns?: number;
  rows?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900"
      role="status"
      aria-label={text}
    >
      <span className="sr-only">{text}</span>
      <div className="border-b border-neutral-800 bg-neutral-900 px-3 py-2">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className="h-3 w-16" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-neutral-800" aria-hidden="true">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div
            key={rowIndex}
            className="grid gap-3 bg-neutral-950 px-3 py-3"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton
                key={columnIndex}
                className={columnIndex === 0 ? "h-10 w-4/5" : "h-5 w-full"}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-800/80 ${className}`}
      aria-hidden="true"
    />
  );
}

export function EmptyState({ text = "No data yet." }: { text?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-700 p-5 text-neutral-400">
      {text}
    </div>
  );
}

export function ToastStack({
  items,
  onClose,
}: {
  items: ToastItem[];
  onClose: (id: number | string) => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let element = document.getElementById("app-notification-stack");
    if (!element) {
      element = document.createElement("div");
      element.id = "app-notification-stack";
      element.className =
        "fixed bottom-4 right-4 z-[200] flex w-[calc(100%-2rem)] max-w-md flex-col gap-2 pointer-events-none";
      document.body.appendChild(element);
    }
    setHost(element);
  }, []);

  if (!host) return null;

  return createPortal(
    <>
      {items.map((item) => {
        const tone = item.tone || "info";
        const styles = {
          success: {
            card: "border-emerald-700/70 bg-emerald-950/95",
            icon: "bg-emerald-500/15 text-emerald-300",
            bar: "bg-emerald-400",
            title: "Success",
          },
          error: {
            card: "border-red-700/70 bg-red-950/95",
            icon: "bg-red-500/15 text-red-300",
            bar: "bg-red-400",
            title: "Something went wrong",
          },
          info: {
            card: "border-blue-700/70 bg-neutral-950/95",
            icon: "bg-blue-500/15 text-blue-300",
            bar: "bg-blue-400",
            title: "Information",
          },
          loading: {
            card: "border-blue-600/70 bg-neutral-950/95",
            icon: "bg-blue-500/15 text-blue-300",
            bar: "bg-blue-500",
            title: "Processing",
          },
        }[tone];
        const StatusIcon =
          tone === "success"
            ? CircleCheck
            : tone === "error"
              ? CircleX
              : tone === "loading"
                ? LoaderCircle
                : Info;
        const percentage = item.progress?.total
          ? Math.min(100, (item.progress.current / item.progress.total) * 100)
          : 0;
        return (
          <div
            key={item.id}
            role={tone === "error" ? "alert" : "status"}
            className={`pointer-events-auto overflow-hidden rounded-xl border p-3.5 text-neutral-100 shadow-2xl backdrop-blur-md [animation:notification-in_180ms_ease-out] ${styles.card}`}
          >
            <div className="flex items-start gap-3">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg object-cover"
                />
              ) : item.iconEmoji ? (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xl">
                  {item.iconEmoji}
                </span>
              ) : (
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}
                >
                  <StatusIcon
                    size={19}
                    className={tone === "loading" ? "animate-spin" : ""}
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-white">
                    {item.title || styles.title}
                  </p>
                  {item.progress ? (
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                      {item.progress.current}/{item.progress.total}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 whitespace-pre-line text-sm leading-5 text-neutral-300">
                  {item.message}
                </p>
                {item.progress ? (
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${styles.bar}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                ) : null}
                {item.progressSummary ? (
                  <div className="mt-2 flex gap-3 text-xs font-medium tabular-nums">
                    <span className="text-emerald-300">
                      {item.progressSummary.successful} successful
                    </span>
                    <span className="text-rose-300">
                      {item.progressSummary.failed} failed
                    </span>
                  </div>
                ) : null}
                {item.details ? (
                  <p className="mt-2 text-xs text-neutral-400">
                    {item.details}
                  </p>
                ) : null}
              </div>
              {tone !== "loading" || item.cancelable ? (
                <button
                  type="button"
                  aria-label={
                    item.cancelable ? "Stop operation" : "Close notification"
                  }
                  title={item.cancelable ? "Stop operation" : undefined}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-white/10 hover:text-white"
                  onClick={() => onClose(item.id)}
                >
                  <X size={15} />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </>,
    host,
  );
}
