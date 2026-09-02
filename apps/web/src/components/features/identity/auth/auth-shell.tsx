"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { SystemBrandLogo } from "@/components/layout/system-brand-logo";
import { useI18n } from "@/providers/i18n-provider";

export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <main className="grid min-h-screen bg-neutral-950 text-neutral-100 lg:grid-cols-[minmax(340px,0.85fr)_minmax(480px,1.15fr)]">
      <section className="relative hidden overflow-hidden border-r border-neutral-800 bg-neutral-900/55 p-10 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="absolute -left-32 top-1/3 size-96 rounded-full bg-blue-600/10 blur-3xl"
        />
        <Link href="/" className="relative z-10 inline-flex w-fit">
          <SystemBrandLogo />
        </Link>
        <div className="relative z-10 max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">
            {t("auth.hero.eyebrow")}
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight text-white">
            {t("auth.hero.title")}
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-neutral-400">
            {t("auth.hero.description")}
          </p>
        </div>
        <p className="relative z-10 text-xs text-neutral-600">© Nexeloq</p>
      </section>
      <section className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-8">
        <div className="absolute right-4 top-4 sm:right-8 sm:top-6">
          <AuthLanguageSwitcher />
        </div>
        <div className="w-full max-w-md">
          <Link href="/" className="mb-8 inline-flex lg:hidden">
            <SystemBrandLogo />
          </Link>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/80 p-5 shadow-2xl shadow-black/20 sm:p-7">
            <h1 className="text-2xl font-semibold text-white">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-400">
              {description}
            </p>
            <div className="mt-6">{children}</div>
            <div className="mt-6 border-t border-neutral-800 pt-5 text-sm text-neutral-400">
              {footer}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function AuthLanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [pending, setPending] = useState(false);
  const options = [
    { locale: "en" as const, flag: "🇬🇧", label: t("auth.language.english") },
    { locale: "ru" as const, flag: "🇷🇺", label: t("auth.language.russian") },
  ];
  return (
    <div
      role="group"
      aria-label={t("auth.language")}
      className="flex gap-1 rounded-xl border border-neutral-800 bg-neutral-900/90 p-1 shadow-lg shadow-black/20"
    >
      {options.map((option) => (
        <button
          key={option.locale}
          type="button"
          lang={option.locale}
          aria-label={option.label}
          aria-pressed={locale === option.locale}
          title={option.label}
          disabled={pending}
          onClick={async () => {
            if (pending || locale === option.locale) return;
            setPending(true);
            try {
              await setLocale(option.locale);
            } finally {
              setPending(false);
            }
          }}
          className={`flex h-9 min-w-10 items-center justify-center rounded-lg px-2 text-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${locale === option.locale ? "bg-blue-600 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
        >
          <span aria-hidden="true">{option.flag}</span>
        </button>
      ))}
    </div>
  );
}
