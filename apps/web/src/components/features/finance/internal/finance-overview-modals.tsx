"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { IconPicker } from "@/components/icons/icon-picker";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import type { Account, ResolvedEmoji, Transaction, TransactionCategory, TransactionType, Transfer } from "@/lib/api";
import { Button, CurrencySelect, DateInput, FormField, Input, Modal, Select } from "@/components/ui/primitives";

const localDate = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function financeOptionIcon(item: { name: string; iconPresentation?: ResolvedEmoji | null }) {
  return {
    "data-icon-url": item.iconPresentation?.type === "image" ? item.iconPresentation.url : undefined,
    "data-icon-emoji": item.iconPresentation?.type === "unicode" ? item.iconPresentation.value : undefined,
    "data-icon-fallback": item.name,
  };
}

export type AccountFormValues = { name: string; currency: string; initialBalance: number; iconId?: string | null; assignedMemberId?: string | null };

export function AccountModal({ open, initial, currencies, onClose, onSubmit }: { open: boolean; initial?: Account; currencies: string[]; onClose: () => void; onSubmit: (value: AccountFormValues) => void }) {
  const defaults = initial ? { name: initial.name, currency: initial.currency, initialBalance: Number(initial.initialBalance), iconId: initial.iconId, assignedMemberId: initial.assignedMemberId } : { name: "", currency: currencies[0] || "USD", initialBalance: 0, iconId: null, assignedMemberId: null };
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AccountFormValues>({ defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, initial]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Modal open={open} onClose={onClose} title={initial ? "Edit account" : "Create account"}><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
    <IconPicker iconId={watch("iconId") ?? null} icon={initial?.iconPresentation} onChange={(iconId) => setValue("iconId", iconId)} />
    <FormField label="Name" required error={errors.name ? "Required field" : undefined}><Input {...register("name", { required: true })} /></FormField>
    <FormField label="Member"><MemberSelect value={watch("assignedMemberId")} onChange={(value) => setValue("assignedMemberId", value || null)} defaultToCurrent={!initial} /></FormField>
    <FormField label="Currency"><CurrencySelect value={watch("currency")} currencies={currencies} onChange={(value) => setValue("currency", value)} /></FormField>
    <FormField label="Initial balance"><Input type="number" step="0.01" {...register("initialBalance", { valueAsNumber: true })} /></FormField>
    <Actions onClose={onClose} />
  </form></Modal>;
}

export type TransactionFormValues = { accountId: string; type: TransactionType; amount: number; categoryId: string; description?: string; date: string; iconId?: string | null };

export function TransactionModal({ open, initial, accounts, categories, onClose, onSubmit }: { open: boolean; initial?: Transaction; accounts: Account[]; categories: TransactionCategory[]; onClose: () => void; onSubmit: (value: TransactionFormValues) => void }) {
  const defaults: TransactionFormValues = initial ? { accountId: initial.accountId, type: initial.type, amount: Number(initial.amount), categoryId: initial.categoryId || "", description: initial.description || "", date: localDate(initial.date), iconId: initial.iconId } : { accountId: accounts[0]?.id || "", type: "expense", amount: 0, categoryId: "", description: "", date: localDate(), iconId: null };
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<TransactionFormValues>({ defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, initial, accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  const type = watch("type");
  const available = categories.filter((category) => category.type === type);
  return <Modal open={open} onClose={onClose} title={initial ? "Edit transaction" : "Create transaction"}><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
    <IconPicker iconId={watch("iconId") ?? null} icon={initial?.iconPresentation} onChange={(iconId) => setValue("iconId", iconId)} />
    <div className="grid gap-3 sm:grid-cols-2"><FormField label="Type"><Select {...register("type")} value={type} onChange={(event) => setValue("type", event.target.value as TransactionType, { shouldDirty: true, shouldValidate: true })}><option value="expense">Expense</option><option value="income">Income</option></Select></FormField><FormField label="Amount" required error={errors.amount ? "Required field" : undefined}><Input type="number" step="0.01" {...register("amount", { required: true, valueAsNumber: true })} /></FormField></div>
    <FormField label="Account" required><Select {...register("accountId", { required: true })} value={watch("accountId")} onChange={(event) => setValue("accountId", event.target.value, { shouldDirty: true, shouldValidate: true })}>{accounts.map((account) => <option key={account.id} value={account.id} {...financeOptionIcon(account)}>{accountDisplayName(account)}</option>)}</Select></FormField>
    <FormField label="Category" required><Select {...register("categoryId", { required: true })} value={watch("categoryId")} onChange={(event) => setValue("categoryId", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select</option>{available.map((category) => <option key={category.id} value={category.id} {...financeOptionIcon(category)}>{category.name}</option>)}</Select></FormField>
    <FormField label="Date"><DateInput {...register("date", { required: true })} value={watch("date")} /></FormField>
    <FormField label="Description"><Input {...register("description")} /></FormField>
    <Actions onClose={onClose} />
  </form></Modal>;
}

export type CategoryFormValues = { name: string; type: TransactionType; iconId?: string | null };
export function CategoryModal({ open, initial, initialType, onClose, onSubmit }: { open: boolean; initial?: TransactionCategory; initialType: TransactionType; onClose: () => void; onSubmit: (value: CategoryFormValues) => void }) {
  const defaults = { name: initial?.name || "", type: initial?.type || initialType, iconId: initial?.iconId };
  const { register, handleSubmit, reset, watch, setValue } = useForm<CategoryFormValues>({ defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, initial, initialType]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Modal open={open} onClose={onClose} title={initial ? "Edit category" : "Create category"}><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
    <IconPicker iconId={watch("iconId") ?? null} icon={initial?.iconPresentation as ResolvedEmoji | null} onChange={(iconId) => setValue("iconId", iconId)} />
    {!initial?.isSystem ? <FormField label="Name" required><Input {...register("name", { required: true })} /></FormField> : null}
    {!initial ? <FormField label="Type"><Select {...register("type")}><option value="expense">Expense</option><option value="income">Income</option></Select></FormField> : null}
    <Actions onClose={onClose} />
  </form></Modal>;
}

export type TransferFormValues = { fromAccountId: string; toAccountId: string; fromAmount: number; toAmount: number; date: string; description?: string };
export function TransferModal({ open, initial, accounts, onClose, onSubmit }: { open: boolean; initial?: Transfer; accounts: Account[]; onClose: () => void; onSubmit: (value: TransferFormValues) => void }) {
  const accountOptions = mergeTransferAccounts(accounts, initial);
  const defaults: TransferFormValues = initial ? { fromAccountId: initial.fromAccountId, toAccountId: initial.toAccountId, fromAmount: Number(initial.fromAmount), toAmount: Number(initial.toAmount), date: localDate(initial.date), description: initial.description || "" } : { fromAccountId: "", toAccountId: "", fromAmount: 0, toAmount: 0, date: localDate(), description: "" };
  const { register, handleSubmit, reset, watch, setValue } = useForm<TransferFormValues>({ defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, initial, accounts]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Modal open={open} onClose={onClose} title={initial ? "Edit transfer" : "Create transfer"}><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
    <FormField label="From" required><Select {...register("fromAccountId", { required: true })} value={watch("fromAccountId")} onChange={(event) => setValue("fromAccountId", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select</option>{accountOptions.map((account) => <option key={account.id} value={account.id} {...financeOptionIcon(account)}>{accountDisplayName(account)}</option>)}</Select></FormField>
    <FormField label="To" required><Select {...register("toAccountId", { required: true })} value={watch("toAccountId")} onChange={(event) => setValue("toAccountId", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select</option>{accountOptions.map((account) => <option key={account.id} value={account.id} {...financeOptionIcon(account)}>{accountDisplayName(account)}</option>)}</Select></FormField>
    <div className="grid gap-3 sm:grid-cols-2"><FormField label="From amount"><Input type="number" step="0.01" {...register("fromAmount", { valueAsNumber: true })} /></FormField><FormField label="To amount"><Input type="number" step="0.01" {...register("toAmount", { valueAsNumber: true })} /></FormField></div>
    <FormField label="Date"><DateInput {...register("date", { required: true })} value={watch("date")} /></FormField><FormField label="Description"><Input {...register("description")} /></FormField>
    <Actions onClose={onClose} />
  </form></Modal>;
}

export function mergeTransferAccounts(accounts: Account[], transfer?: Transfer) {
  const result = [...accounts];
  for (const account of [transfer?.fromAccount, transfer?.toAccount]) {
    if (account && !result.some((item) => item.id === account.id)) result.push(account);
  }
  return result;
}

function Actions({ onClose }: { onClose: () => void }) { return <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>; }
