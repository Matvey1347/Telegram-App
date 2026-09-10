"use client";

import {
  Children,
  type PropsWithChildren,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Eye, EyeOff } from "lucide-react";
import type { FinanceLocale } from "../i18n/core";
import { financeUiTokens } from "./finance-ui-tokens";

const selectCopy = {
  en: { select: "Select", search: "Search…", empty: "No options found" },
  uk: { select: "Оберіть", search: "Пошук…", empty: "Нічого не знайдено" },
  ru: { select: "Выберите", search: "Поиск…", empty: "Ничего не найдено" },
} as const;

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
      className={`inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${financeUiTokens.focus} ${props.className ?? ""}`}
    />
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
      className={`w-full px-3 py-2 text-sm ${financeUiTokens.control} ${isPassword ? "pr-11" : ""} ${className ?? ""}`}
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
        className={`absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-800 hover:text-white disabled:pointer-events-none disabled:opacity-50 ${financeUiTokens.focus}`}
        aria-label={passwordVisible ? "Hide password" : "Show password"}
        aria-pressed={passwordVisible}
      >
        {passwordVisible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  );
});

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 text-sm ${financeUiTokens.control} ${props.className ?? ""}`}
    />
  );
}

function OptionIcon({
  emoji,
  fallback,
  large = false,
}: {
  emoji?: string;
  fallback?: string;
  large?: boolean;
}) {
  if (emoji) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center leading-none ${large ? "h-7 w-7 text-[22px]" : "h-5 w-5 text-[15px]"}`}
      >
        {emoji}
      </span>
    );
  }
  if (!fallback) return null;
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-neutral-700 bg-neutral-800 text-[11px] font-semibold text-neutral-200">
      {fallback.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

export function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & {
    uiLocale?: FinanceLocale;
    triggerAriaLabel?: string;
    iconOnly?: boolean;
    hideSelectedOption?: boolean;
    largeOptionIcons?: boolean;
  },
) {
  const copy = selectCopy[props.uiLocale ?? "en"];
  const options = Children.toArray(props.children)
    .filter(isValidElement)
    .map((child, index) => {
      const optionProps =
        child.props as React.OptionHTMLAttributes<HTMLOptionElement>;
      const label = Children.toArray(optionProps.children)
        .filter((node) => typeof node === "string" || typeof node === "number")
        .join("");
      const value = String(optionProps.value ?? label);
      return {
        key: `${value}-${index}`,
        value,
        label,
        disabled: Boolean(optionProps.disabled),
        hidden: Boolean(optionProps.hidden),
        emoji: optionProps["data-icon-emoji" as keyof typeof optionProps] as
          | string
          | undefined,
        fallback: optionProps[
          "data-icon-fallback" as keyof typeof optionProps
        ] as string | undefined,
        meta: optionProps["data-option-meta" as keyof typeof optionProps] as
          | string
          | undefined,
        className:
          optionProps.className ||
          (value.toLowerCase() === "income"
            ? "text-emerald-300"
            : value.toLowerCase().startsWith("expense")
              ? "text-rose-300"
              : ""),
      };
    });
  const [internalValue, setInternalValue] = useState(
    String(props.defaultValue ?? options[0]?.value ?? ""),
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();
  const controlled = props.value !== undefined;
  const currentValue = String((controlled ? props.value : internalValue) ?? "");
  const selected = options.find((option) => option.value === currentValue);
  const menuOptions = options.filter(
    (option) =>
      !option.hidden &&
      (!props.hideSelectedOption || option.value !== currentValue),
  );
  const showSearch = menuOptions.length > 5;
  const filtered = showSearch
    ? menuOptions.filter((option) =>
        `${option.label} ${option.meta ?? ""} ${option.value}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      )
    : menuOptions;

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const commit = (value: string) => {
    if (!controlled) setInternalValue(value);
    props.onChange?.({
      target: { name: props.name, value },
    } as React.ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    setSearch("");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const optionButtons = () =>
    Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='option']:not(:disabled)",
      ) ?? [],
    );
  const focusOption = (edge: "first" | "last") => {
    window.requestAnimationFrame(() => {
      const buttons = optionButtons();
      buttons[edge === "first" ? 0 : buttons.length - 1]?.focus();
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={props.disabled}
        aria-label={props.triggerAriaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
            focusOption("first");
          } else if (event.key === "Escape") {
            setOpen(false);
            setSearch("");
          }
        }}
        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm disabled:opacity-50 ${props.iconOnly ? "relative !justify-start" : ""} ${financeUiTokens.control} ${props.className ?? ""}`}
      >
        <span
          className={`flex min-w-0 items-center gap-2 ${props.iconOnly ? "flex-none justify-start" : "flex-1"}`}
        >
          <OptionIcon
            emoji={selected?.emoji}
            fallback={selected?.fallback}
            large={props.largeOptionIcons}
          />
          <span
            data-select-trigger-label
            className={`${props.iconOnly ? "sr-only" : "truncate"} ${selected?.className || (selected ? "text-white" : "text-neutral-400")}`}
          >
            {selected?.label || copy.select}
          </span>
          {selected?.meta ? (
            <bdi className="ml-auto rounded-md bg-neutral-800 px-2 py-0.5 text-xs font-normal text-neutral-400">
              {selected.meta}
            </bdi>
          ) : null}
        </span>
        <ChevronDown
          size={16}
          className={
            props.iconOnly
              ? "absolute right-1.5 text-neutral-400"
              : "text-neutral-400"
          }
        />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          {showSearch ? (
            <div className="border-b border-neutral-800 p-2">
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                    setSearch("");
                    triggerRef.current?.focus();
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    focusOption("first");
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const first = filtered.find((option) => !option.disabled);
                    if (first) commit(first.value);
                  }
                }}
                placeholder={copy.search}
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-blue-600"
              />
            </div>
          ) : null}
          <div
            id={listboxId}
            role="listbox"
            aria-label={props.triggerAriaLabel}
            className="max-h-60 overflow-auto"
          >
            {filtered.map((option) => (
              <button
                key={option.key}
                type="button"
                role="option"
                aria-selected={option.value === currentValue}
                aria-label={props.iconOnly ? option.label : undefined}
                disabled={option.disabled}
                onClick={() => commit(option.value)}
                onKeyDown={(event) => {
                  const buttons = optionButtons();
                  const index = buttons.indexOf(event.currentTarget);
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setOpen(false);
                    triggerRef.current?.focus();
                  } else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    buttons[Math.min(index + 1, buttons.length - 1)]?.focus();
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    buttons[Math.max(index - 1, 0)]?.focus();
                  } else if (event.key === "Home") {
                    event.preventDefault();
                    buttons[0]?.focus();
                  } else if (event.key === "End") {
                    event.preventDefault();
                    buttons.at(-1)?.focus();
                  }
                }}
                className={`flex w-full items-center px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 ${props.iconOnly ? "justify-center" : "justify-between"}`}
              >
                <span
                  className={`flex min-w-0 items-center gap-2 ${props.iconOnly ? "flex-none justify-center" : "flex-1"}`}
                >
                  <OptionIcon
                    emoji={option.emoji}
                    fallback={option.fallback}
                    large={props.largeOptionIcons}
                  />
                  <span
                    data-select-option-label
                    className={`${props.iconOnly ? "sr-only" : "truncate"} ${option.className}`}
                  >
                    {option.label}
                  </span>
                  {option.meta ? (
                    <bdi className="ml-auto rounded-md bg-neutral-800/80 px-2 py-0.5 text-xs font-normal text-neutral-400">
                      {option.meta}
                    </bdi>
                  ) : null}
                </span>
                {option.value === currentValue ? (
                  <Check size={14} className="text-blue-300" />
                ) : null}
              </button>
            ))}
            {!filtered.length ? (
              <p className="px-3 py-3 text-center text-sm text-neutral-500">
                {copy.empty}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      <input type="hidden" name={props.name} value={currentValue} />
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
