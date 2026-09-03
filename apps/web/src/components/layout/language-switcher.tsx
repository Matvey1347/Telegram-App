"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { accountApi, type AccountMe } from "@/lib/api";
import { useI18n } from "@/providers/i18n-provider";
import type { TranslationKey } from "@/i18n/catalog";
import { ActionMenu } from "@/components/ui/action-menu";

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
  const patchCaches = (next: "en" | "ru") => {
      queryClient.setQueryData<AccountMe>(["account-me"], (account) =>
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

  return (
    <ActionMenu
      label={t("navigation.language")}
      trigger={<span aria-hidden="true">{current.flag}</span>}
      triggerClassName="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900/45 text-sm transition hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      menuClassName="absolute right-0 top-10 z-50 w-40 rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-2xl"
    >
      {options.map((option) => {
        const selected = option.locale === locale;
        return (
          <button
            key={option.locale}
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            lang={option.locale}
            disabled={update.isPending}
            onClick={() => {
              if (selected || update.isPending) return;
              update.mutate({ next: option.locale, previous: locale });
            }}
            className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-neutral-800 disabled:opacity-60 ${selected ? "text-white" : "text-neutral-300"}`}
          >
            <span aria-hidden="true">{option.flag}</span>
            <span className="flex-1">{t(option.labelKey)}</span>
            {selected ? <Check size={14} aria-hidden="true" /> : null}
          </button>
        );
      })}
    </ActionMenu>
  );
}
