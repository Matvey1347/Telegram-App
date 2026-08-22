import { Pencil, Trash2 } from "lucide-react";
import type { ConsumerFinanceTransaction } from "@telegram-system/shared";
import { formatMoney } from "@/lib/features/finance/money";
import {
  financeCopy,
  financeIntlLocale,
  localizeFinanceCategory,
  type FinanceLocale,
} from "./finance-i18n";

export function FinanceMobileTransactionRow({
  item,
  locale,
  timezone,
  onDetail,
  onEdit,
  onDelete,
}: {
  item: ConsumerFinanceTransaction;
  locale: FinanceLocale;
  timezone: string;
  onDetail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = financeCopy(locale);
  const income = item.type === "INCOME";
  const title =
    item.merchantDisplay ||
    item.description ||
    (item.category
      ? localizeFinanceCategory(item.category.name, item.category.key, locale)
      : undefined) ||
    (income ? t.income : t.expense);
  const sourceLabel =
    item.source === "RECEIPT"
      ? t.receipt
      : item.source === "AI"
        ? t.aiEntry
        : t.manualEntry;
  const amount = `${income ? "+" : "−"}${formatMoney(
    item.amount,
    item.currency,
    "symbol",
  )}`;
  const amountSize =
    amount.length > 20
      ? "text-[10px] tracking-tight"
      : amount.length > 14
        ? "text-xs tracking-tight"
        : "text-sm";

  return (
    <div className="flex min-w-0 items-center gap-1 px-3 py-1 sm:px-4">
      <button
        type="button"
        aria-label={t.transactionDetails}
        onClick={onDetail}
        className="grid min-h-16 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium" title={title}>
            {title}
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {item.account?.name ?? t.accountFallback} ·{" "}
            {new Intl.DateTimeFormat(financeIntlLocale(locale), {
              timeZone: timezone,
            }).format(new Date(item.occurredAt))}
            {item.source ? ` · ${sourceLabel}` : ""}
            {item.itemCount
              ? ` · ${item.itemCount} ${item.itemCount === 1 ? t.item : t.items}`
              : ""}
          </span>
        </span>
        <strong
          title={amount}
          className={`max-w-[42vw] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap text-right tabular-nums ${amountSize} ${income ? "text-emerald-300" : "text-rose-300"}`}
        >
          {amount}
        </strong>
      </button>
      <MobileRowAction
        label={t.editTransactionLabel}
        tone="text-neutral-300"
        onClick={onEdit}
      >
        <Pencil size={16} />
      </MobileRowAction>
      <MobileRowAction
        label={t.deleteTransactionLabel}
        tone="text-rose-300"
        onClick={onDelete}
      >
        <Trash2 size={16} />
      </MobileRowAction>
    </div>
  );
}

function MobileRowAction({
  label,
  tone,
  onClick,
  children,
}: {
  label: string;
  tone: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex min-h-11 min-w-11 items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-sky-300 ${tone}`}
    >
      {children}
    </button>
  );
}
