"use client";
import {
  Children,
  forwardRef,
  isValidElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";
import { uiCopy, type UiLocale } from "@/lib/ui-i18n";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { overlayPortalHost } from "./overlay-portal-host";
import { OptionIcon, floatingMenuStyle } from "./select-shared";
type OptionProps = React.OptionHTMLAttributes<HTMLOptionElement> & {
  "data-icon-url"?: string;
  "data-icon-emoji"?: string;
  "data-icon-fallback"?: string;
};
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  uiLocale?: UiLocale;
  onSearchPaste?: (value: string) => boolean | Promise<boolean>;
  searchPlaceholder?: string;
};
export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  function Select(props, ref) {
    const i18n = useOptionalI18n(),
      ui = uiCopy(props.uiLocale ?? i18n?.locale);
    const financeTypeClass = (value: string) => {
      if (value === "income") return "text-emerald-300";
      if (value === "expense" || value === "expenses" || value === "expences")
        return "text-rose-300";
      return "";
    };

    const options = Children.toArray(props.children)
      .filter((node): node is React.ReactElement<OptionProps> =>
        isValidElement<OptionProps>(node),
      )
      .map((child, idx: number) => {
        const rawChildren = Children.toArray(child.props?.children);
        const label = rawChildren.length
          ? rawChildren
              .map((node) =>
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
    const menuId = useId();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(
      null,
    );
    const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
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

    useDismissiblePopover({
      open,
      onDismiss: () => {
        setOpen(false);
        setSearch("");
      },
      triggerRef: rootRef,
      contentRef: menuRef,
    });

    useLayoutEffect(() => {
      if (!open) return;
      const update = () => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        setPortalHost(overlayPortalHost(trigger));
        setMenuStyle(
          floatingMenuStyle(trigger.getBoundingClientRect(), {
            maxMenuHeight: 320,
          }),
        );
      };
      update();
      window.addEventListener("resize", update);
      window.addEventListener("scroll", update, true);
      return () => {
        window.removeEventListener("resize", update);
        window.removeEventListener("scroll", update, true);
      };
    }, [open]);

    const focusOption = (direction: number, edge?: "first" | "last") => {
      const options = [
        ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="option"]:not([disabled])',
        ) ?? []),
      ];
      if (!options.length) return;
      const current = options.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        edge === "first"
          ? 0
          : edge === "last"
            ? options.length - 1
            : (current + direction + options.length) % options.length;
      options[next]?.focus();
    };
    const commit = (next: string) => {
      if (!isControlled) setInternalValue(next);
      if (props.onChange) {
        props.onChange({
          target: { name: props.name, value: next },
        } as unknown as React.ChangeEvent<HTMLSelectElement>);
      }
    };

    return (
      <div ref={rootRef} className="relative">
        <button
          ref={(node) => {
            triggerRef.current = node;
            if (typeof ref === "function") ref(node);
            else if (ref) ref.current = node;
          }}
          id={props.id}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          aria-describedby={props["aria-describedby"]}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? menuId : undefined}
          onKeyDown={(event) => {
            props.onKeyDown?.(
              event as unknown as React.KeyboardEvent<HTMLSelectElement>,
            );
            if (event.defaultPrevented) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open)
                props.onFocus?.({
                  target: { name: props.name, value: currentValue },
                } as unknown as React.FocusEvent<HTMLSelectElement>);
              setOpen(true);
              requestAnimationFrame(() =>
                focusOption(
                  event.key === "ArrowDown" ? 1 : -1,
                  event.key === "ArrowDown" ? "first" : "last",
                ),
              );
            }
          }}
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
                className="z-[120] flex flex-col overflow-hidden overscroll-contain rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
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
                        const pasted = event.clipboardData
                          .getData("text")
                          .trim();
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
                <div
                  id={menuId}
                  role="listbox"
                  aria-label={props["aria-label"] ?? ui.select}
                  className="min-h-0 flex-1 overflow-auto overscroll-contain"
                  onKeyDown={(event) => {
                    if (
                      ["ArrowDown", "ArrowUp", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      focusOption(
                        event.key === "ArrowUp" ? -1 : 1,
                        event.key === "Home"
                          ? "first"
                          : event.key === "End"
                            ? "last"
                            : undefined,
                      );
                    }
                  }}
                >
                  {filteredMenuOptions.map((opt) => (
                    <button
                      key={opt.key}
                      role="option"
                      aria-selected={opt.value === currentValue}
                      type="button"
                      disabled={opt.disabled}
                      onClick={() => {
                        if (opt.disabled) return;
                        commit(opt.value);
                        setOpen(false);
                        setSearch("");
                        triggerRef.current?.focus();
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
              portalHost ?? document.body,
            )
          : null}
        <input
          type="hidden"
          name={props.name}
          value={currentValue}
          disabled={props.disabled}
          form={props.form}
        />
      </div>
    );
  },
);
