import { Search } from "lucide-react";
import type { Account, TransactionCategory } from "@/lib/api";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import { Input, Select } from "@/components/ui/primitives";
import { financeOptionIcon } from "./finance-overview-modals";

export function FinanceTransactionFilterToolbar({
  accounts,
  categories,
  search,
  accountId,
  categoryId,
  onSearchChange,
  onAccountChange,
  onCategoryChange,
}: {
  accounts: Account[];
  categories: TransactionCategory[];
  search: string;
  accountId: string;
  categoryId: string;
  onSearchChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
}) {
  return (
    <div className="mb-3 grid gap-2 sm:grid-cols-3">
      <label className="relative">
        <Search aria-hidden="true" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
        <Input aria-label="Search transactions" value={search} onChange={(event) => onSearchChange(event.target.value)} className="pl-9" placeholder="Search transactions" />
      </label>
      <Select aria-label="Filter transactions by account" value={accountId} onChange={(event) => onAccountChange(event.target.value)}>
        <option value="">All accounts</option>
        {accounts.map((account) => <option key={account.id} value={account.id} {...financeOptionIcon(account)}>{accountDisplayName(account)}</option>)}
      </Select>
      <Select aria-label="Filter transactions by category" value={categoryId} onChange={(event) => onCategoryChange(event.target.value)}>
        <option value="">All categories</option>
        {categories.map((category) => <option key={category.id} value={category.id} {...financeOptionIcon(category)}>{category.name}</option>)}
      </Select>
    </div>
  );
}
