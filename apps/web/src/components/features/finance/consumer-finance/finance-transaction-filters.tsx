"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
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
  Modal,
  Select,
} from "@/components/ui/primitives";
import {
  financeCopy,
  localizeFinanceCategory,
  type FinanceLocale,
} from "./finance-i18n";
import type { ConsumerFinanceSurface } from "./consumer-finance-navigation";

type FinanceTransactionFiltersProps = {
  filters: ConsumerFinanceHistoryQuery;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  locale: FinanceLocale;
  onChange: (next: ConsumerFinanceHistoryQuery) => void;
  surface?: ConsumerFinanceSurface;
};

export function FinanceTransactionFilters({
  filters,
  accounts,
  categories,
  locale,
  onChange,
  surface = "telegram",
}: FinanceTransactionFiltersProps) {
  const [open, setOpen] = useState(false);
  const t = financeCopy(locale);
  const activeCount = [
    filters.search,
    filters.type,
    filters.accountId,
    filters.categoryId,
    filters.from,
    filters.to,
  ].filter(Boolean).length;

  if (surface === "telegram") {
    return (
      <>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            {t.filters}
            {activeCount ? (
              <span className="rounded-full bg-sky-400 px-1.5 text-xs font-semibold text-neutral-950">
                {activeCount}
              </span>
            ) : null}
          </Button>
        </div>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          closeLabel={t.close}
          title={t.filters}
        >
          <FilterFields
            filters={filters}
            accounts={accounts}
            categories={categories}
            locale={locale}
            onChange={onChange}
            compact
          />
        </Modal>
      </>
    );
  }

  return (
    <Card>
      <FilterFields
        filters={filters}
        accounts={accounts}
        categories={categories}
        locale={locale}
        onChange={onChange}
      />
    </Card>
  );
}

function FilterFields({
  filters,
  accounts,
  categories,
  locale,
  onChange,
  compact = false,
}: Omit<FinanceTransactionFiltersProps, "surface"> & { compact?: boolean }) {
  const t = financeCopy(locale);
  const update = (changes: Partial<ConsumerFinanceHistoryQuery>) =>
    onChange({ ...filters, ...changes, cursor: undefined });

  return (
    <div
      className={
        compact
          ? "grid grid-cols-2 gap-2"
          : "grid gap-2 lg:grid-cols-4 xl:grid-cols-6"
      }
    >
      <Input
        className={compact ? "col-span-2" : "lg:col-span-2"}
        aria-label={t.searchTransactions}
        placeholder={t.searchPlaceholder}
        value={filters.search ?? ""}
        onChange={(event) =>
          update({ search: event.target.value || undefined })
        }
      />
      <Select
        uiLocale={locale}
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
        uiLocale={locale}
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
        uiLocale={locale}
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
        uiLocale={locale}
        from={filters.from}
        to={filters.to}
        onChange={({ from, to }) =>
          update({ from: from || undefined, to: to || undefined })
        }
      />
      <Button
        variant="secondary"
        className={compact ? "col-span-2" : ""}
        onClick={() => onChange({ limit: 30 })}
      >
        {t.clearFilters}
      </Button>
    </div>
  );
}
