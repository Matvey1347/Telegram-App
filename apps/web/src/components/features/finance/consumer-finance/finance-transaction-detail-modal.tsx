"use client";

import { useQuery } from "@tanstack/react-query";
import type { ConsumerFinanceTransaction } from "@telegram-system/shared";
import {
  Button,
  ErrorState,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { formatMoney } from "@/lib/features/finance/money";
import { consumerFinanceKeys } from "@/lib/query-keys";
import {
  financeCopy,
  localizeFinanceCategory,
  type FinanceLocale,
} from "./finance-i18n";

export function FinanceTransactionDetailModal({
  botId,
  transaction,
  locale,
  onClose,
}: {
  botId: string;
  transaction: ConsumerFinanceTransaction | null;
  locale: FinanceLocale;
  onClose: () => void;
}) {
  const t = financeCopy(locale);
  const detail = useQuery({
    queryKey: consumerFinanceKeys.transaction(botId, transaction?.id ?? ""),
    queryFn: () => consumerFinanceApi.transaction(botId, transaction!.id),
    enabled: !!transaction,
  });
  return (
    <Modal
      open={!!transaction}
      onClose={onClose}
      title={t.transactionDetails}
      closeLabel={t.close}
    >
      {detail.isLoading ? (
        <LoadingState text={t.loading} />
      ) : detail.isError ? (
        <div className="space-y-3">
          <ErrorState text={t.receiptItemsLoadError} />
          <Button variant="secondary" onClick={() => detail.refetch()}>
            {t.retry}
          </Button>
        </div>
      ) : detail.data ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3 border-b border-neutral-800 pb-3">
            <div className="min-w-0">
              <p className="truncate font-medium">
                {detail.data.merchantDisplay ||
                  detail.data.description ||
                  t.receipt}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {detail.data.account?.name ?? t.accountFallback}
                {detail.data.category
                  ? ` · ${localizeFinanceCategory(detail.data.category.name, detail.data.category.key, locale)}`
                  : ""}
              </p>
            </div>
            <strong>
              {formatMoney(detail.data.amount, detail.data.currency, "symbol")}
            </strong>
          </div>
          <section aria-label={t.items}>
            <h4 className="text-sm font-medium">{t.items}</h4>
            {detail.data.items.length ? (
              <div className="mt-2 divide-y divide-neutral-800">
                {detail.data.items.map((item) => (
                  <div key={item.id} className="py-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="min-w-0 break-words">
                        {item.displayName}
                      </span>
                      <strong className="shrink-0">
                        {formatMoney(item.totalAmount, item.currency, "symbol")}
                      </strong>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {item.quantity ? `${t.quantity}: ${item.quantity}` : null}
                      {item.quantity && item.unitPrice ? " · " : null}
                      {item.unitPrice
                        ? `${t.unitPrice}: ${formatMoney(item.unitPrice, item.currency, "symbol")}`
                        : null}
                      {item.category
                        ? ` · ${localizeFinanceCategory(item.category.name, item.category.key, locale)}`
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-400">
                {t.noLineItems}
              </p>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  );
}
