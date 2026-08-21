import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceHistoryQuery,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  DateRangeInput,
  Input,
  Select,
} from "@/components/ui/primitives";
import {
  financeCopy,
  localizeFinanceCategory,
  type FinanceLocale,
} from "./finance-i18n";

export function FinanceTransactionFilters({
  filters,
  accounts,
  categories,
  locale,
  onChange,
}: {
  filters: ConsumerFinanceHistoryQuery;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  locale: FinanceLocale;
  onChange: (next: ConsumerFinanceHistoryQuery) => void;
}) {
  const t = financeCopy(locale);
  const update = (changes: Partial<ConsumerFinanceHistoryQuery>) =>
    onChange({ ...filters, ...changes, cursor: undefined });
  return (
    <Card>
      <div className="grid grid-cols-2 gap-2">
        <Input
          className="col-span-2"
          aria-label={t.searchTransactions}
          placeholder={t.searchPlaceholder}
          value={filters.search ?? ""}
          onChange={(event) =>
            update({ search: event.target.value || undefined })
          }
        />
        <Select
          aria-label={t.transactionType}
          value={filters.type ?? ""}
          onChange={(event) =>
            update({
              type: (event.target.value ||
                undefined) as ConsumerFinanceHistoryQuery["type"],
            })
          }
        >
          <option value="">{t.allTypes}</option>
          <option value="EXPENSE">{t.expense}</option>
          <option value="INCOME">{t.income}</option>
        </Select>
        <Select
          aria-label={t.account}
          value={filters.accountId ?? ""}
          onChange={(event) =>
            update({ accountId: event.target.value || undefined })
          }
        >
          <option value="">{t.allAccounts}</option>
          {accounts.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t.category}
          value={filters.categoryId ?? ""}
          onChange={(event) =>
            update({ categoryId: event.target.value || undefined })
          }
        >
          <option value="">{t.allCategories}</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {localizeFinanceCategory(item.name, item.key, locale)}
            </option>
          ))}
        </Select>
        <DateRangeInput
          from={filters.from}
          to={filters.to}
          onChange={({ from, to }) =>
            update({ from: from || undefined, to: to || undefined })
          }
        />
        <Button
          variant="secondary"
          className="col-span-2"
          onClick={() => onChange({ limit: 30 })}
        >
          {t.clearFilters}
        </Button>
      </div>
    </Card>
  );
}
