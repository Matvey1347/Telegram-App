import type {
  ConsumerFinanceInvestmentCashFlow,
  ConsumerFinanceInvestmentValuation,
} from "@telegram-system/shared";
import { Button, Card, EmptyState, ErrorState, LoadingState } from "./ui";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financeInvestmentsCopy } from "./i18n/investments";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";

export function FinanceInvestmentHistories({
  cashFlows,
  valuations,
  locale,
  cashFlowsLoading,
  valuationsLoading,
  cashFlowsError,
  valuationsError,
  cashFlowsHasMore,
  valuationsHasMore,
  loadingMoreCashFlows,
  loadingMoreValuations,
  onRetryCashFlows,
  onRetryValuations,
  onLoadMoreCashFlows,
  onLoadMoreValuations,
}: {
  cashFlows: ConsumerFinanceInvestmentCashFlow[];
  valuations: ConsumerFinanceInvestmentValuation[];
  locale: FinanceLocale;
  cashFlowsLoading: boolean;
  valuationsLoading: boolean;
  cashFlowsError: boolean;
  valuationsError: boolean;
  cashFlowsHasMore: boolean;
  valuationsHasMore: boolean;
  loadingMoreCashFlows: boolean;
  loadingMoreValuations: boolean;
  onRetryCashFlows: () => void;
  onRetryValuations: () => void;
  onLoadMoreCashFlows: () => void;
  onLoadMoreValuations: () => void;
}) {
  const t = financeInvestmentsCopy(locale);
  const date = (value: string) =>
    new Intl.DateTimeFormat(financeIntlLocale(locale)).format(new Date(value));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-2 font-medium">{t.cashFlows}</h2>
        {cashFlowsLoading ? (
          <LoadingState text={t.loading} />
        ) : cashFlowsError ? (
          <div className="space-y-2">
            <ErrorState text={t.actionError} />
            <Button variant="secondary" onClick={onRetryCashFlows}>
              {t.retry}
            </Button>
          </div>
        ) : cashFlows.length ? (
          cashFlows.map((flow) => (
            <div
              key={flow.id}
              className="flex justify-between gap-3 border-b border-neutral-800 py-3 last:border-0"
            >
              <div>
                <p className="text-sm">
                  {flow.kind === "CONTRIBUTION"
                    ? t.contribution
                    : t.investmentReturn}
                </p>
                <p className="text-xs text-neutral-500">
                  {flow.account?.name ?? t.account} · {date(flow.occurredAt)}
                </p>
                {flow.note ? (
                  <p className="text-xs text-neutral-400">{flow.note}</p>
                ) : null}
              </div>
              <strong
                className={
                  flow.kind === "RETURN" ? "text-emerald-300" : "text-sky-200"
                }
              >
                {formatMoney(flow.amount, flow.currency, "symbol")}
              </strong>
            </div>
          ))
        ) : (
          <EmptyState text={t.historyEmpty} />
        )}
        {cashFlowsHasMore ? (
          <Button
            className="mt-3"
            variant="secondary"
            disabled={loadingMoreCashFlows}
            onClick={onLoadMoreCashFlows}
          >
            {t.loadMore}
          </Button>
        ) : null}
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">{t.valuationHistory}</h2>
        {valuationsLoading ? (
          <LoadingState text={t.loading} />
        ) : valuationsError ? (
          <div className="space-y-2">
            <ErrorState text={t.actionError} />
            <Button variant="secondary" onClick={onRetryValuations}>
              {t.retry}
            </Button>
          </div>
        ) : valuations.length ? (
          valuations.map((valuation) => (
            <div
              key={valuation.id}
              className="flex justify-between gap-3 border-b border-neutral-800 py-3 last:border-0"
            >
              <div>
                <p className="text-sm">{date(valuation.valuedAt)}</p>
                {valuation.correctsValuationId ? (
                  <p className="text-xs text-amber-300">{t.correctValuation}</p>
                ) : null}
              </div>
              <strong>
                {formatMoney(valuation.value, valuation.currency, "symbol")}
              </strong>
            </div>
          ))
        ) : (
          <EmptyState text={t.noValuations} />
        )}
        {valuationsHasMore ? (
          <Button
            className="mt-3"
            variant="secondary"
            disabled={loadingMoreValuations}
            onClick={onLoadMoreValuations}
          >
            {t.loadMore}
          </Button>
        ) : null}
      </Card>
    </div>
  );
}
