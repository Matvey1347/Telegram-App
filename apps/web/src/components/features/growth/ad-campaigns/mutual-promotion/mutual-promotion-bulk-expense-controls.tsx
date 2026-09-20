"use client";

import type { Account } from "@/lib/api";
import {
  CustomSelect,
  FormField,
  Input,
} from "@/components/ui/primitives";
import type { BulkExpenseDraft } from "./mutual-promotion-form-types";

export function MutualPromotionBulkExpenseControls({
  value,
  channelCount,
  accounts,
  onChange,
}: {
  value: BulkExpenseDraft;
  channelCount: number;
  accounts: Account[];
  onChange: (value: BulkExpenseDraft) => void;
}) {
  if (!channelCount) return null;
  return (
    <section className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) =>
            onChange({ ...value, enabled: event.target.checked })
          }
          className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-amber-100">
            All selected channels are paid
          </span>
          <span className="block text-xs text-amber-200/60">
            Choose one Finance account and split the total exactly across {" "}
            {channelCount} channels.
          </span>
        </span>
      </label>
      {value.enabled ? (
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <FormField label="Finance account" required>
            <CustomSelect
              value={value.accountId}
              onChange={(accountId) => onChange({ ...value, accountId })}
              placeholder="Select expense account"
              options={accounts.map((account) => ({
                value: account.id,
                label: account.name,
                meta: account.currency,
                iconPresentation: account.iconPresentation ?? undefined,
                iconFallback: account.name,
              }))}
            />
          </FormField>
          <FormField label="Total expense" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={value.totalAmount}
              onChange={(event) =>
                onChange({ ...value, totalAmount: event.target.value })
              }
              placeholder="0.00"
            />
          </FormField>
        </div>
      ) : null}
    </section>
  );
}
