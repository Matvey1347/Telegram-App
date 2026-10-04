"use client";

import Image from "next/image";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ConsumerFinanceAssistantProposal, ConsumerFinanceTransaction, ConsumerFinanceTransactionInput } from "@telegram-system/shared";
import { consumerFinanceLedgerApi } from "@/lib/features/finance/consumer-finance-ledger-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { Button } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeAssistantCopy } from "./i18n/assistant";
import { financeTransactionsCopy } from "./i18n/transactions";
import { DesktopTransactionTable } from "./finance-desktop-transaction-table";
import { FinanceMobileTransactionRow } from "./finance-mobile-transaction-row";
import { FinanceTransactionEditor } from "./finance-transaction-editor";

export function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="mr-8 flex items-end gap-2">
      <Image src="/finance/assistant/jarvis-v1.webp" alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full border border-cyan-500/20 bg-cyan-950/40 object-cover" />
      <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-neutral-800 bg-neutral-900/80 px-3.5 py-2.5 text-sm leading-5 text-neutral-200">{children}</p>
    </div>
  );
}

type Operation = ConsumerFinanceAssistantProposal["operations"][number];
type ProposalCopy = ReturnType<typeof financeAssistantCopy>;

export function AssistantProposalCard({ botId, locale, timezone, compact = false, proposal, t, confirming, cancelling, revising, onConfirm, onCancel, onRevise }: {
  botId: string;
  locale: FinanceLocale;
  timezone: string;
  compact?: boolean;
  proposal: ConsumerFinanceAssistantProposal;
  t: ProposalCopy;
  confirming: boolean;
  cancelling: boolean;
  revising: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => Promise<void>;
  onRevise: (operations: Operation[], keepIndices?: number[]) => Promise<void>;
}) {
  const accounts = useQuery({ queryKey: consumerFinanceKeys.accounts(botId), queryFn: () => consumerFinanceLedgerApi.accounts(botId) });
  const categories = useQuery({ queryKey: consumerFinanceKeys.categories(botId), queryFn: () => consumerFinanceLedgerApi.categories(botId) });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set(proposal.operations.map((_, index) => index)));
  const [busy, setBusy] = useState(false);
  const rows: ConsumerFinanceTransaction[] = proposal.operations.map((operation, index) => ({
    id: `proposal-${index}`, accountId: operation.accountId, categoryId: operation.categoryId,
    type: operation.type, purpose: operation.purpose ?? "ORDINARY", amount: operation.amount,
    economicAmount: operation.economicAmount, necessity: operation.necessity, currency: operation.currency,
    occurredAt: operation.occurredAt, description: operation.description, source: "AI",
    account: accounts.data?.find((account) => account.id === operation.accountId),
    category: categories.data?.find((category) => category.id === operation.categoryId) ?? null,
  }));
  const selectedIds = new Set(rows.filter((_, index) => selected.has(index)).map((row) => row.id));
  const rowIndex = (row: ConsumerFinanceTransaction) => Number(row.id.slice("proposal-".length));
  const toggle = (row: ConsumerFinanceTransaction) => setSelected((current) => {
    const next = new Set(current);
    const index = rowIndex(row);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return next;
  });
  const remove = async (row: ConsumerFinanceTransaction) => {
    if (proposal.operations.length === 1) return onCancel();
    const keepIndices = proposal.operations.map((_, index) => index).filter((index) => index !== rowIndex(row));
    await onRevise(keepIndices.map((index) => proposal.operations[index]), keepIndices);
    setSelected(new Set(keepIndices.map((_, index) => index)));
  };
  const saveDraft = async (payload: ConsumerFinanceTransactionInput) => {
    if (editingIndex === null) return;
    const next = proposal.operations.map((operation, index) => index === editingIndex ? {
      ...operation, amount: payload.amount, economicAmount: payload.economicAmount,
      accountId: payload.accountId,
      accountName: accounts.data?.find((account) => account.id === payload.accountId)?.name ?? operation.accountName,
      categoryId: payload.categoryId ?? null,
      categoryName: categories.data?.find((category) => category.id === payload.categoryId)?.name ?? null,
      description: payload.description ?? "", occurredAt: payload.occurredAt,
      necessity: payload.necessity, purpose: payload.purpose ?? operation.purpose,
    } : operation);
    await onRevise(next);
    setEditingIndex(null);
  };
  const saveSelected = async () => {
    if (!selected.size || busy) return;
    setBusy(true);
    try {
      if (selected.size !== proposal.operations.length) {
        const keepIndices = [...selected].sort((a, b) => a - b);
        await onRevise(keepIndices.map((index) => proposal.operations[index]), keepIndices);
      }
      await onConfirm();
    } finally { setBusy(false); }
  };
  const transactionCopy = financeTransactionsCopy(locale);
  const loading = accounts.isLoading || categories.isLoading;
  const failed = accounts.isError || categories.isError;
  return (
    <div className="space-y-3 rounded-xl border border-amber-800 bg-amber-950/20 p-3">
      <p className="text-sm font-medium text-amber-200">{t.proposal}</p>
      {loading ? <p className="text-sm text-neutral-400">{transactionCopy.loadingReferences}</p> : null}
      {failed ? <Button variant="cancel" onClick={() => { void accounts.refetch(); void categories.refetch(); }}>{t.retry}</Button> : null}
      {!loading && !failed ? <>
        <div className={`${compact ? "hidden" : "hidden md:block"} overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950`}>
          <DesktopTransactionTable items={rows} locale={locale} timezone={timezone} onDetail={() => undefined} onEdit={(row) => setEditingIndex(rowIndex(row))} onDelete={(row) => { void remove(row).catch(() => undefined); }} selectedIds={selectedIds} onToggle={toggle} />
        </div>
        <div className={`divide-y divide-neutral-800 rounded-lg border border-neutral-800 bg-neutral-950 ${compact ? "" : "md:hidden"}`}>
          {rows.map((row) => <div key={row.id} className="flex items-center">
            <input type="checkbox" className="ml-2" aria-label={`${transactionCopy.description}: ${row.description ?? row.id}`} checked={selectedIds.has(row.id)} onChange={() => toggle(row)} />
            <div className="min-w-0 flex-1"><FinanceMobileTransactionRow item={row} locale={locale} timezone={timezone} onDetail={() => undefined} onEdit={() => setEditingIndex(rowIndex(row))} onDelete={() => { void remove(row).catch(() => undefined); }} /></div>
          </div>)}
        </div>
      </> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={loading || failed || !selected.size || busy || confirming || revising} onClick={() => { void saveSelected().catch(() => undefined); }}>{t.confirm}</Button>
        <Button variant="cancel" disabled={cancelling || busy} onClick={() => { void onCancel().catch(() => undefined); }}>{t.cancel}</Button>
      </div>
      {editingIndex !== null && rows[editingIndex] && accounts.data && categories.data ? <FinanceTransactionEditor
        key={rows[editingIndex].id} botId={botId} accounts={accounts.data} categories={categories.data}
        editing={rows[editingIndex]} locale={locale} timezone={timezone}
        allowedCurrency={rows[editingIndex].currency}
        onClose={() => setEditingIndex(null)} onSaved={() => undefined} onSaveDraft={saveDraft}
      /> : null}
    </div>
  );
}
