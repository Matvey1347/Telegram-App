"use client";

import { RefreshCw } from "lucide-react";
import Image from "next/image";
import { financeBrandIcon } from "@finance-web/lib/finance-brand-icon";
import { financeAuthCopy } from "@consumer-finance/web/components/i18n/auth";
import { normalizeFinanceLocale } from "@consumer-finance/web/components/i18n/core";

export function GroshlyStartupError({
  telegram = false,
  onRetry,
}: {
  telegram?: boolean;
  onRetry: () => void;
}) {
  const isBrowser = typeof window !== "undefined";
  const locale = normalizeFinanceLocale(
    isBrowser ? localStorage.getItem("groshly-language") || navigator.language : "uk",
  );
  const dark = isBrowser && localStorage.getItem("groshly-theme") === "dark";
  const copy = financeAuthCopy(locale);

  return (
    <main className="groshly-login" data-theme={dark ? "dark" : "light"} lang={locale}>
      <div className="groshly-login-header">
        <div className="groshly-login-brand">
          <Image src={financeBrandIcon(dark ? "dark" : "light")} alt="" width={40} height={40} unoptimized />
          <strong>Groshly<span>.</span></strong>
        </div>
      </div>
      <div className="groshly-login-body">
        <section className="groshly-login-card" aria-labelledby="groshly-startup-title">
          <h1 id="groshly-startup-title">{copy.groshlyStartupErrorTitle}</h1>
          <p role="alert">{telegram ? copy.groshlyTelegramStartupError : copy.bootstrapError}</p>
          <button type="button" className="groshly-login-button" onClick={onRetry}>
            <RefreshCw size={18} aria-hidden="true" />{copy.retry}
          </button>
        </section>
      </div>
    </main>
  );
}
