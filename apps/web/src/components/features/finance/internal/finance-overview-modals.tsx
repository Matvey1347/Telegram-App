"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { IconPicker } from "@/components/icons/icon-picker";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import type { Account, ResolvedEmoji, TransactionCategory, TransactionType, Transfer } from "@/lib/api";
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
  return <Modal open={open} onClose={onClose} title={initial ? "Edit account" : "Create account"} size="xs"><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
    <IconPicker iconId={watch("iconId") ?? null} icon={initial?.iconPresentation} onChange={(iconId) => setValue("iconId", iconId)} />
    <FormField label="Name" required error={errors.name ? "Required field" : undefined}><Input {...register("name", { required: true })} /></FormField>
    <FormField label="Member"><MemberSelect value={watch("assignedMemberId")} onChange={(value) => setValue("assignedMemberId", value || null)} defaultToCurrent={!initial} /></FormField>
    <FormField label="Currency"><CurrencySelect value={watch("currency")} currencies={currencies} onChange={(value) => setValue("currency", value)} /></FormField>
    <FormField label="Initial balance"><Input type="number" step="0.01" {...register("initialBalance", { valueAsNumber: true })} /></FormField>
    <Actions onClose={onClose} />
  </form></Modal>;
}

export type CategoryFormValues = { name: string; type: TransactionType; iconId?: string | null };
export function CategoryModal({ open, initial, initialType, onClose, onSubmit }: { open: boolean; initial?: TransactionCategory; initialType: TransactionType; onClose: () => void; onSubmit: (value: CategoryFormValues) => void }) {
  const defaults = { name: initial?.name || "", type: initial?.type || initialType, iconId: initial?.iconId };
  const { register, handleSubmit, reset, watch, setValue } = useForm<CategoryFormValues>({ defaultValues: defaults });
  useEffect(() => { if (open) reset(defaults); }, [open, initial, initialType]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Modal open={open} onClose={onClose} title={initial ? "Edit category" : "Create category"} size="xs"><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
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
  return <Modal open={open} onClose={onClose} title={initial ? "Edit transfer" : "Create transfer"} size="xs"><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]" data-testid="transfer-from-row"><FormField label="From" required><Select {...register("fromAccountId", { required: true })} value={watch("fromAccountId")} onChange={(event) => setValue("fromAccountId", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select</option>{accountOptions.map((account) => <option key={account.id} value={account.id} {...financeOptionIcon(account)}>{accountDisplayName(account)}</option>)}</Select></FormField><FormField label="From amount"><Input type="number" step="0.01" {...register("fromAmount", { valueAsNumber: true })} /></FormField></div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]" data-testid="transfer-to-row"><FormField label="To" required><Select {...register("toAccountId", { required: true })} value={watch("toAccountId")} onChange={(event) => setValue("toAccountId", event.target.value, { shouldDirty: true, shouldValidate: true })}><option value="">Select</option>{accountOptions.map((account) => <option key={account.id} value={account.id} {...financeOptionIcon(account)}>{accountDisplayName(account)}</option>)}</Select></FormField><FormField label="To amount"><Input type="number" step="0.01" {...register("toAmount", { valueAsNumber: true })} /></FormField></div>
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
