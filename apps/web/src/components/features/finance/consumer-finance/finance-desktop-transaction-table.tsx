import { List, Pencil, Trash2 } from "lucide-react";
import type { ConsumerFinanceTransaction } from "@telegram-system/shared";
import { Table } from "./ui";
import { financeIntlLocale, type FinanceLocale } from "./i18n/core";
import { financeTransactionsCopy } from "./i18n/transactions";
import { localizeFinanceCategory } from "./finance-category-i18n";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { IconAvatar } from "./ui/finance-icon-avatar";

export function DesktopTransactionTable({
  items,
  locale,
  timezone,
  onDetail,
  onEdit,
  onDelete,
}: {
  items: ConsumerFinanceTransaction[];
  locale: FinanceLocale;
  timezone: string;
  onDetail: (item: ConsumerFinanceTransaction) => void;
  onEdit: (item: ConsumerFinanceTransaction) => void;
  onDelete: (item: ConsumerFinanceTransaction) => void;
}) {
  const t = financeTransactionsCopy(locale);
  return (
    <Table>
      <thead className="border-b border-neutral-700 text-xs uppercase text-neutral-500">
        <tr>
          <th className="px-3 py-2 font-medium">{t.description}</th>
          <th className="px-3 py-2 font-medium">{t.date}</th>
          <th className="px-3 py-2 font-medium">{t.account}</th>
          <th className="px-3 py-2 font-medium">{t.category}</th>
          <th className="px-3 py-2 text-right font-medium">{t.amount}</th>
          <th className="w-36 px-3 py-2" aria-label={t.edit} />
        </tr>
      </thead>
      <tbody className="divide-y divide-neutral-800">
        {items.map((item) => {
          const income =
            item.type === "INCOME" || item.purpose === "INVESTMENT_RETURN";
          const generated = item.purpose.startsWith("INVESTMENT_");
          const purposeTitle =
            item.purpose === "INVESTMENT_CONTRIBUTION"
              ? t.investmentContribution
              : item.purpose === "INVESTMENT_RETURN"
                ? t.investmentReturn
                : item.purpose === "REIMBURSEMENT"
                  ? t.reimbursement
                  : item.purpose === "PASS_THROUGH"
                    ? t.passThrough
                    : item.purpose === "DEBT_REPAYMENT"
                      ? t.debtRepayment
                      : undefined;
          return (
            <tr key={item.id} className="hover:bg-neutral-800/40">
              <td className="max-w-80 px-3 py-2.5">
                <button
                  type="button"
                  className="block max-w-full truncate text-left text-sky-200 hover:underline"
                  onClick={() => onDetail(item)}
                >
                  {purposeTitle ||
                    item.merchantDisplay ||
                    item.description ||
                    (income ? t.income : t.expense)}
                </button>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-neutral-400">
                {new Intl.DateTimeFormat(financeIntlLocale(locale), {
                  timeZone: timezone,
                }).format(new Date(item.occurredAt))}
              </td>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2">
                  <IconAvatar
                    icon={item.account?.iconPresentation}
                    label={item.account?.name ?? t.accountFallback}
                    size="xs"
                  />
                  <span>{item.account?.name ?? t.accountFallback}</span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-neutral-400">
                {generated ? (
                  purposeTitle
                ) : item.category ? (
                  <span className="flex items-center gap-2">
                    <IconAvatar
                      icon={item.category.iconPresentation}
                      label={item.category.name}
                      size="xs"
                    />
                    <span>
                      {localizeFinanceCategory(
                        item.category.name,
                        item.category.key,
                        locale,
                      )}
                    </span>
                  </span>
                ) : (
                  t.uncategorized
                )}
              </td>
              <td
                className={`whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums ${income ? "text-emerald-300" : "text-rose-300"}`}
              >
                {income ? "+" : "−"}
                {formatMoney(item.amount, item.currency, "symbol")}
              </td>
              <td className="px-2 py-1.5">
                <div className="flex justify-end gap-1">
                  <RowAction
                    label={t.transactionDetails}
                    tone="text-sky-300"
                    onClick={() => onDetail(item)}
                  >
                    <List size={16} />
                  </RowAction>
                  {!generated ? (
                    <>
                      <RowAction
                        label={t.editTransactionLabel}
                        tone="text-neutral-300"
                        onClick={() => onEdit(item)}
                      >
                        <Pencil size={16} />
                      </RowAction>
                      <RowAction
                        label={t.deleteTransactionLabel}
                        tone="text-rose-300"
                        onClick={() => onDelete(item)}
                      >
                        <Trash2 size={16} />
                      </RowAction>
                    </>
                  ) : null}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

function RowAction({
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
      className={`flex min-h-9 min-w-9 items-center justify-center rounded outline-none hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-sky-300 ${tone}`}
    >
      {children}
    </button>
  );
}
