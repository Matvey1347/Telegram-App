import type { Transaction, Transfer } from "@/lib/api";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { formatDate } from "@/lib/date-format";
import { FinanceActionMenu } from "./finance-action-menu";
import { AccountPreview, CurrencyAmount } from "./finance-format";
import { transactionAvatar } from "./transaction-avatar";

export function FinanceTransactionRow({
  transaction,
  onEdit,
  onDelete,
}: {
  transaction: Transaction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-finance-row="transaction"
      className="relative grid gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-3 pr-12 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto_32px] sm:items-center sm:pr-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <IconAvatar
          icon={transactionAvatar(transaction)}
          label={transaction.description || transaction.category}
          size="md"
        />
        <div className="min-w-0">
          <div className="truncate font-medium text-white">
            {transaction.description ||
              transaction.categoryRef?.name ||
              "Transaction"}
          </div>
          <div className="truncate text-xs text-neutral-500">
            {transaction.categoryRef?.name || transaction.category} ·{" "}
            {transaction.account?.name} · {formatDate(transaction.date)}
          </div>
        </div>
      </div>
      <CurrencyAmount
        amount={
          transaction.type === "expense"
            ? -Number(transaction.amount)
            : transaction.amount
        }
        currency={transaction.currency}
        className={`font-semibold ${transaction.type === "income" ? "text-emerald-300" : "text-rose-300"}`}
      />
      <div
        data-finance-row-actions="true"
        className="absolute right-3 top-3 sm:static"
      >
        <FinanceActionMenu
          label="transaction"
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

export function FinanceTransferRow({
  transfer,
  onEdit,
  onDelete,
}: {
  transfer: Transfer;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-finance-row="transfer"
      className="relative grid gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 pr-12 md:grid-cols-[minmax(0,1fr)_minmax(4rem,0.45fr)_minmax(0,1fr)_32px] md:items-center md:pr-4"
    >
      <TransferAccount
        account={transfer.fromAccount}
        label="Withdrawn"
        amount={-Number(transfer.fromAmount)}
        currency={transfer.fromCurrency}
        amountClassName="text-rose-300"
      />
      <TransferFlowArrow />
      <TransferAccount
        account={transfer.toAccount}
        label="Received"
        amount={transfer.toAmount}
        currency={transfer.toCurrency}
        amountClassName="text-emerald-300"
      />
      <div
        data-finance-row-actions="true"
        className="absolute right-3 top-3 md:static"
      >
        <FinanceActionMenu
          label="transfer"
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function TransferAccount({
  account,
  label,
  amount,
  currency,
  amountClassName,
}: {
  account: Transfer["fromAccount"];
  label: string;
  amount: Transfer["fromAmount"];
  currency: string;
  amountClassName: string;
}) {
  return (
    <div className="min-w-0">
      <AccountPreview account={account} />
      <div className="mt-2 pl-9 text-xs text-neutral-500">
        {label}{" "}
        <CurrencyAmount
          amount={amount}
          currency={currency}
          className={`ml-1 font-semibold ${amountClassName}`}
        />
      </div>
    </div>
  );
}

export function TransferFlowArrow() {
  return (
    <div
      data-testid="transfer-flow-arrow"
      aria-label="Transfer direction"
      role="img"
      className="flex h-10 items-center justify-center text-neutral-600 md:h-auto md:w-full"
    >
      <div className="flex h-full flex-col items-center md:hidden">
        <svg className="min-h-0 w-3 flex-1" aria-hidden="true">
          <line
            x1="6"
            y1="0"
            x2="6"
            y2="100%"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <svg viewBox="0 0 12 7" className="h-[7px] w-3" aria-hidden="true">
          <path
            d="M1 1l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </div>
      <div className="hidden w-full items-center md:flex">
        <svg className="h-3 min-w-0 flex-1" aria-hidden="true">
          <line
            x1="0"
            y1="6"
            x2="100%"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
        <svg viewBox="0 0 7 12" className="h-3 w-[7px]" aria-hidden="true">
          <path
            d="M1 1l5 5-5 5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </div>
  );
}
