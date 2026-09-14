"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsumerFinancePortabilityHistoryItem } from "@telegram-system/shared";
import { Download, History, RotateCcw, Upload } from "lucide-react";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { Button } from "./ui";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financeSettingsCopy } from "./i18n/settings";

function OperationIcon({
  operation,
}: Pick<ConsumerFinancePortabilityHistoryItem, "operation">) {
  if (operation === "EXPORT") return <Download aria-hidden size={17} />;
  if (operation === "ROLLBACK") return <RotateCcw aria-hidden size={17} />;
  return <Upload aria-hidden size={17} />;
}

export function FinancePortabilityHistory({
  botId,
  locale,
}: {
  botId: string;
  locale: FinanceLocale;
}) {
  const t = financeSettingsCopy(locale);
  const client = useQueryClient();
  const [selected, setSelected] =
    useState<ConsumerFinancePortabilityHistoryItem | null>(null);
  const [restored, setRestored] = useState(false);
  const history = useQuery({
    queryKey: consumerFinanceKeys.portabilityHistory(botId),
    queryFn: () => consumerFinanceApi.portabilityHistory(botId),
    staleTime: 30_000,
  });
  const rollback = useMutation({
    mutationFn: (importId: string) =>
      consumerFinanceApi.rollbackImport(botId, importId),
    onSuccess: async () => {
      setRestored(true);
      setSelected(null);
      await client.invalidateQueries({
        queryKey: consumerFinanceKeys.root(botId),
      });
    },
  });

  const operationLabel = (item: ConsumerFinancePortabilityHistoryItem) =>
    item.operation === "EXPORT"
      ? t.portabilityExport
      : item.operation === "ROLLBACK"
        ? t.portabilityRollback
        : t.portabilityImport;

  return (
    <section className="mt-6 border-t border-neutral-800 pt-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-neutral-800 p-2 text-neutral-300">
          <History aria-hidden size={18} />
        </span>
        <div>
          <h3 className="font-medium">{t.portabilityHistory}</h3>
          <p className="mt-1 text-sm text-neutral-400">
            {t.portabilityHistoryHelp}
          </p>
        </div>
      </div>

      {restored ? (
        <p className="mt-4 text-sm text-emerald-300" role="status">
          {t.portabilityRollbackSuccess}
        </p>
      ) : null}
      {history.isPending ? (
        <p className="mt-4 text-sm text-neutral-400" role="status">
          {t.portabilityHistoryLoading}
        </p>
      ) : history.isError ? (
        <div className="mt-4 flex items-center gap-3" role="alert">
          <p className="text-sm text-rose-300">{t.portabilityHistoryError}</p>
          <Button variant="secondary" onClick={() => void history.refetch()}>
            {t.portabilityRetry}
          </Button>
        </div>
      ) : history.data.items.length === 0 ? (
        <p className="mt-4 text-sm text-neutral-400">
          {t.portabilityHistoryEmpty}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {history.data.items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950/40 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 text-neutral-400">
                  <OperationIcon operation={item.operation} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {operationLabel(item)}
                    {item.mode
                      ? ` · ${item.mode === "ADD" ? t.portabilityAdd : t.portabilityReplace}`
                      : ""}
                    {item.sourceFileName ? ` · ${item.sourceFileName}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {new Intl.DateTimeFormat(financeIntlLocale(locale), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.createdAt))}
                    {` · ${item.recordCount} ${t.portabilityRecords}`}
                  </p>
                </div>
              </div>
              {item.operation !== "EXPORT" ? (
                item.canRollback ? (
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => {
                      setRestored(false);
                      setSelected(item);
                    }}
                  >
                    <RotateCcw aria-hidden size={15} />
                    {t.portabilityRollbackAction}
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-neutral-500">
                    {item.rolledBackAt
                      ? t.portabilityRolledBack
                      : t.portabilityRollbackUnavailable}
                  </span>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <FinanceConfirmModal
        open={selected !== null}
        locale={locale}
        onClose={() => setSelected(null)}
        onConfirm={() => rollback.mutateAsync(selected!.id)}
        entityName={t.portabilityRollbackConfirmation}
        actionLabel={t.portabilityRollbackAction}
        description={t.portabilityRollbackDescription}
      />
    </section>
  );
}
