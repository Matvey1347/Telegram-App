"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Coins, Languages } from "lucide-react";
import { accountApi, type AccountMe } from "@/lib/api";
import { CURRENCIES, currencyPresentation, type AccountShell } from "@telegram-system/shared";
import { useI18n } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";
import { useDismissiblePopover } from "@/hooks/use-dismissible-popover";
import { useFinanceDisplay } from "@/providers/finance-display-provider";

const options = [
  { locale: "en" as const, flag: "🇬🇧", labelKey: "navigation.english" },
  { locale: "ru" as const, flag: "🇷🇺", labelKey: "navigation.russian" },
] as const satisfies readonly {
  locale: "en" | "ru";
  flag: string;
  labelKey: TranslationKey;
}[];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { currency, canChoose, setCurrency } = useFinanceDisplay();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useDismissiblePopover({ open, onDismiss: () => setOpen(false), triggerRef: trigger, contentRef: panel });
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  const patchCaches = (next: "en" | "ru") => {
    queryClient.setQueryData<AccountMe>(["account-me"], (account) =>
      account ? { ...account, locale: next } : account,
    );
    queryClient.setQueryData<AccountShell>(["account-shell"], (account) =>
      account ? { ...account, locale: next } : account,
    );
    queryClient.setQueryData(["auth", "me"], (current: unknown) => {
      if (!current || typeof current !== "object") return current;
      const value = current as { user?: Record<string, unknown> };
      return { ...value, user: value.user ? { ...value.user, locale: next } : value.user };
    });
  };
  const update = useMutation({
    mutationFn: async ({ next }: { next: "en" | "ru"; previous: "en" | "ru" }) => {
      await setLocale(next);
      return accountApi.updateLocale(next);
    },
    onMutate: ({ next }) => patchCaches(next),
    onSuccess: ({ locale: savedLocale }) => patchCaches(savedLocale),
    onError: async (_error, { previous }) => {
      patchCaches(previous);
      await setLocale(previous);
    },
  });
  const current = options.find((option) => option.locale === locale) ?? options[0];

  const activeCurrency = currency ? currencyPresentation(currency) : undefined;
  const title = t("navigation.regionalPreferences");
  const tileClass = (selected: boolean) =>
    `flex min-h-10 w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 ${selected ? "border-blue-500 bg-blue-950/30 text-white" : "border-neutral-800 bg-neutral-950/50 text-neutral-200"}`;

  return (
    <div className="w-fit shrink-0 lg:relative" onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        ref={trigger}
        type="button"
        aria-label={activeCurrency ? `${title}: ${activeCurrency.code}` : title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 shrink-0 items-center whitespace-nowrap justify-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/45 px-2.5 text-sm font-medium transition hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span aria-hidden="true">{activeCurrency?.flag ?? current.flag}</span>
        <span>{activeCurrency?.code ?? t(current.labelKey)}</span>
        <ChevronDown size={14} aria-hidden="true" className="text-neutral-400" />
      </button>
      {open && (
        <div ref={panel} id={panelId} role="dialog" aria-label={title} tabIndex={-1}
          className="absolute left-0 top-full z-40 mt-2 w-[min(20rem,calc(100vw-2.75rem))] space-y-3 overflow-y-auto overscroll-contain rounded-xl border border-neutral-700 bg-neutral-900 p-3 shadow-xl outline-none max-h-[calc(100dvh-8rem-env(safe-area-inset-top))]">
          {canChoose && (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                <span className="inline-flex items-center gap-2"><Coins size={16} aria-hidden="true" />{t("navigation.displayCurrency")}</span>
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {CURRENCIES.map((code) => {
                  const { flag, symbol } = currencyPresentation(code);
                  const selected = activeCurrency?.code === code;
                  return (
                    <button key={code} type="button" aria-pressed={selected} onClick={() => setCurrency(code)} className={tileClass(selected)}>
                      <span aria-hidden="true">{flag}</span>
                      <span className="flex-1 whitespace-nowrap font-semibold">{symbol} · {code}</span>
                      {selected && <Check size={14} aria-hidden="true" className="shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              <span className="inline-flex items-center gap-2"><Languages size={16} aria-hidden="true" />{t("navigation.language")}</span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {options.map((option) => {
                const selected = option.locale === locale;
                return (
                  <button
                    key={option.locale}
                    type="button"
                    aria-pressed={selected}
                    lang={option.locale}
                    disabled={update.isPending}
                    onClick={() => {
                      if (!selected && !update.isPending) update.mutate({ next: option.locale, previous: locale });
                    }}
                    className={tileClass(selected)}
                  >
                    <span aria-hidden="true">{option.flag}</span>
                    <span className="flex-1">{t(option.labelKey)}</span>
                    {selected && <Check size={14} aria-hidden="true" className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
