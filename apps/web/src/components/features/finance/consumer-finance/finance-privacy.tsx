"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Upload } from "lucide-react";
import { Button, Card } from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { type FinanceLocale } from "./i18n/core";
import { financeSettingsCopy } from "./i18n/settings";
import { FinanceImportModal } from "./finance-import-modal";
import { FinancePortabilityHistory } from "./finance-portability-history";

export function FinancePrivacy({
  botId,
  locale,
}: {
  botId: string;
  locale: FinanceLocale;
}) {
  const t = financeSettingsCopy(locale);
  const client = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.portabilityHistory(botId),
      });
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
          <Download aria-hidden size={16} />
          {exportMutation.isPending ? t.exportingData : t.exportData}
        </Button>
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <Upload aria-hidden size={16} />
          {t.importData}
        </Button>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          <Trash2 aria-hidden size={16} />
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
      <FinanceImportModal
        open={importOpen}
        botId={botId}
        locale={locale}
        onClose={() => setImportOpen(false)}
      />
      <FinancePortabilityHistory botId={botId} locale={locale} />
    </Card>
  );
}
