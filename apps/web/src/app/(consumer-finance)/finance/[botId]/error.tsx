"use client";

import { financeCopy, normalizeFinanceLocale } from "@/components/features/finance/consumer-finance/finance-i18n";

export default function FinanceMiniAppError({ reset }: { reset: () => void }) {
  const t = financeCopy(
    normalizeFinanceLocale(
      typeof navigator === "undefined" ? undefined : navigator.language,
    ),
  );
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 p-4 text-neutral-100">
      <div className="max-w-md rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <p>{t.bootstrapError}</p>
        <button className="mt-3 min-h-11 rounded-lg px-3 text-sky-300" onClick={reset}>
          {t.retry}
        </button>
      </div>
    </main>
  );
}
