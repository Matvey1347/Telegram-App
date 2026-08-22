"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { financeCopy, type FinanceLocale } from "./finance-i18n";

export function FinancePrivacy({
  botId,
  locale,
}: {
  botId: string;
  locale: FinanceLocale;
}) {
  const t = financeCopy(locale);
  const client = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exportMutation = useMutation({
    mutationFn: () => consumerFinanceApi.exportData(botId),
    onSuccess: (data) => {
      const link = document.createElement("a");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      link.href = url;
      link.download = "finance-export.json";
      link.click();
      URL.revokeObjectURL(url);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => consumerFinanceApi.deleteData(botId),
    onSuccess: () => {
      client.removeQueries({ queryKey: consumerFinanceKeys.root(botId) });
      window.location.reload();
    },
  });

  return (
    <Card>
      <h2 className="font-medium">{t.dataPrivacy}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
        >
          {exportMutation.isPending ? t.exportingData : t.exportData}
        </Button>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          {t.deleteAllData}
        </Button>
      </div>
      {exportMutation.isError ? (
        <p className="mt-2 text-sm text-rose-300">{t.exportError}</p>
      ) : null}
      {deleteMutation.isError ? (
        <p className="mt-2 text-sm text-rose-300">{t.deleteDataError}</p>
      ) : null}
      <FinanceConfirmModal
        open={confirmDelete}
        locale={locale}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutateAsync()}
        entityName={t.deleteAllDataConfirmation}
        actionLabel={t.deleteAllData}
        description={t.deleteAllDataDescription}
      />
    </Card>
  );
}
