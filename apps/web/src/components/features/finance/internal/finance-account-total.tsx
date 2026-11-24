import { useQuery } from "@tanstack/react-query";
import { accountsApi } from "@/lib/api";
import { accountKeys } from "@/lib/query-keys";
import { formatFinanceAmount, sumDisplayBalances } from "@/lib/features/finance/money";
import { useFinanceDisplay } from "@/providers/finance-display-provider";
import { useOptionalI18n } from "@/providers/i18n-provider";
import type { AccountScope } from "./account-groups";

export function FinanceAccountTotal({ scope }: { scope: AccountScope }) {
  const { currency, rates } = useFinanceDisplay();
  const i18n = useOptionalI18n();
  const total = useQuery({
    queryKey: [...accountKeys.balanceTotals(), scope],
    queryFn: () => accountsApi.balances({ scope }),
    enabled: Boolean(currency),
    placeholderData: () => undefined,
  });
  if (!currency) return null;
  const value = total.data ? sumDisplayBalances(total.data, currency, rates) : null;
  const label = i18n?.locale === "ru" ? "Всего" : "Total";
  const unavailable = i18n?.locale === "ru" ? "Итог недоступен" : "Total unavailable";
  return (
    <div className="flex min-h-9 items-center gap-2 rounded-lg border border-neutral-800 px-2.5 text-sm tabular-nums">
      <span className="text-neutral-400">{label}</span>
      <output aria-label={label} aria-busy={total.isPending} title={value === null && !total.isPending ? unavailable : undefined} className="font-semibold text-white">
        {value === null ? "—" : formatFinanceAmount(value, currency)}
      </output>
    </div>
  );
}
