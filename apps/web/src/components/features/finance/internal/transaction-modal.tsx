"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type {
  Account,
  TelegramChannelSelectOption as TelegramChannel,
  Transaction,
  TransactionCategory,
  WorkspaceMemberSelectOption as WorkspaceMember,
} from "@/lib/api";
import {
  telegramChannelsApi,
  transactionCategoriesApi,
} from "@/lib/api";
import { accountDisplayName } from "@/lib/features/finance/account-display";
import {
  Button,
  DateInput,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { IconPicker } from "@/components/icons/icon-picker";

export type InternalTransactionValues = {
  accountId: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string;
  memberId?: string;
  telegramChannelId?: string;
  description?: string;
  date: string;
  iconId?: string | null;
};

type CategoryPurpose =
  | "investment"
  | "buy-channels"
  | "channel-advertising-revenue"
  | "standard";

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizedCategoryName(category: TransactionCategory) {
  return category.name.trim().toLowerCase();
}

export function transactionCategoryPurpose(
  category?: TransactionCategory | null,
): CategoryPurpose {
  if (!category) return "standard";
  const name = normalizedCategoryName(category);
  if (
    category.type === "income" &&
    (category.key === "investment" || name === "investment")
  ) {
    return "investment";
  }
  if (
    category.type === "expense" &&
    (category.key === "buy_channels" ||
      name === "buy channels" ||
      name === "buy channels (legacy)")
  ) {
    return "buy-channels";
  }
  if (
    category.type === "income" &&
    (category.key === "channel_advertising_revenue" ||
      name === "channel advertising revenue")
  ) {
    return "channel-advertising-revenue";
  }
  return "standard";
}

function iconOptionProps(item: {
  name: string;
  iconPresentation?:
    | { type: "image"; url: string }
    | { type: "unicode"; value: string }
    | null;
}) {
  return {
    "data-icon-url":
      item.iconPresentation?.type === "image"
        ? item.iconPresentation.url
        : undefined,
    "data-icon-emoji":
      item.iconPresentation?.type === "unicode"
        ? item.iconPresentation.value
        : undefined,
    "data-icon-fallback": item.name,
  };
}

function memberOptionProps(member: WorkspaceMember) {
  return {
    "data-icon-url":
      member.avatarPresentation?.type === "image"
        ? member.avatarPresentation.url
        : undefined,
    "data-icon-emoji":
      member.avatarPresentation?.type === "unicode"
        ? member.avatarPresentation.value
        : undefined,
    "data-icon-fallback": member.user.name,
  };
}

function channelOptionProps(channel: TelegramChannel) {
  return {
    "data-icon-url": channel.photoUrl ?? undefined,
    "data-icon-fallback": channel.title,
  };
}

function transactionDefaults(
  initial?: Transaction,
): InternalTransactionValues {
  return initial
    ? {
        accountId: initial.accountId,
        type: initial.type,
        amount: Number(initial.amount),
        categoryId: initial.categoryId ?? initial.categoryRef?.id ?? "",
        memberId: initial.memberId ?? "",
        telegramChannelId:
          initial.telegramChannel?.id ??
          initial.purchasedTelegramChannel?.id ??
          "",
        description: initial.description ?? "",
        date: formatLocalDate(new Date(initial.date)),
        iconId: initial.iconId ?? null,
      }
    : {
        accountId: "",
        type: "expense",
        amount: 0,
        categoryId: "",
        memberId: "",
        telegramChannelId: "",
        description: "",
        date: formatLocalDate(new Date()),
        iconId: null,
      };
}

export function InternalTransactionModal({
  open,
  onClose,
  onSubmit,
  title,
  accounts,
  members,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: InternalTransactionValues) => void;
  title: string;
  accounts: Account[];
  members: WorkspaceMember[];
  initial?: Transaction;
}) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<InternalTransactionValues>({
    defaultValues: transactionDefaults(initial),
  });
  const lastAutoMemberIdRef = useRef("");
  const type = watch("type");
  const accountId = watch("accountId");
  const categoryId = watch("categoryId");
  const memberId = watch("memberId") ?? "";
  const telegramChannelId = watch("telegramChannelId") ?? "";
  const { data: categories } = useQuery({
    queryKey: ["transaction-categories", type],
    queryFn: () => transactionCategoriesApi.list(type),
    enabled: open && Boolean(type),
  });
  const { data: telegramChannels } = useQuery({
    queryKey: ["telegram-channels", "select", "transactions-modal"],
    queryFn: () => telegramChannelsApi.select(),
    enabled: open,
  });
  const selectedCategory = useMemo(
    () => categories?.find((category) => category.id === categoryId),
    [categories, categoryId],
  );
  const categoryPurpose = transactionCategoryPurpose(selectedCategory);
  const isInvestment = categoryPurpose === "investment";
  const isBuyChannels = categoryPurpose === "buy-channels";
  const isChannelAdvertisingRevenue =
    categoryPurpose === "channel-advertising-revenue";
  const requiresTelegramChannel =
    isBuyChannels || isChannelAdvertisingRevenue;
  const hasCategoryExtraField = isInvestment || requiresTelegramChannel;
  const ownChannels = useMemo(
    () =>
      (telegramChannels ?? []).filter(
        (channel) => channel.isActive !== false,
      ),
    [telegramChannels],
  );
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId),
    [accounts, accountId],
  );

  useEffect(() => {
    if (!open) return;
    lastAutoMemberIdRef.current = "";
    reset(transactionDefaults(initial));
  }, [open, initial, reset]);

  useEffect(() => {
    if (!isInvestment) {
      lastAutoMemberIdRef.current = "";
      setValue("memberId", "");
    }
  }, [isInvestment, setValue]);

  useEffect(() => {
    if (!requiresTelegramChannel) setValue("telegramChannelId", "");
  }, [requiresTelegramChannel, setValue]);

  useEffect(() => {
    if (!isInvestment) return;
    const autoMemberId = selectedAccount?.assignedMemberId ?? "";
    const currentMemberId = getValues("memberId") ?? "";
    const lastAutoMemberId = lastAutoMemberIdRef.current;

    if (!autoMemberId) {
      if (currentMemberId && currentMemberId === lastAutoMemberId) {
        setValue("memberId", "");
      }
      lastAutoMemberIdRef.current = "";
      return;
    }
    if (!currentMemberId || currentMemberId === lastAutoMemberId) {
      setValue("memberId", autoMemberId, {
        shouldDirty: true,
        shouldValidate: true,
      });
      lastAutoMemberIdRef.current = autoMemberId;
    }
  }, [getValues, isInvestment, selectedAccount, setValue]);

  useEffect(() => {
    const selected = getValues("categoryId");
    if (!selected || categories === undefined) return;
    if (!categories.some((category) => category.id === selected)) {
      setValue("categoryId", "");
      setValue("memberId", "");
    }
  }, [categories, getValues, setValue, type]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="xs">
      <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
        <IconPicker
          iconId={watch("iconId") ?? null}
          icon={initial?.iconPresentation}
          onChange={(iconId) =>
            setValue("iconId", iconId, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <div
          className="grid gap-3 md:grid-cols-2"
          data-testid="transaction-primary-fields"
        >
          <div
            className={hasCategoryExtraField ? "md:col-span-2" : undefined}
            data-transaction-field="type"
          >
          <FormField label="Type">
            <Select
              {...register("type")}
              value={type}
              onChange={(event) =>
                setValue("type", event.target.value as InternalTransactionValues["type"], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </Select>
          </FormField>
          </div>
          <div data-transaction-field="category">
          <FormField
            label="Category"
            required
            error={errors.categoryId ? "Required field" : undefined}
          >
            <Select
              {...register("categoryId", { required: true })}
              value={categoryId}
              onChange={(event) =>
                setValue("categoryId", event.target.value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <option value="" disabled hidden>
                Select category
              </option>
              {categories?.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                  {...iconOptionProps(category)}
                >
                  {category.name}
                </option>
              ))}
            </Select>
          </FormField>
          </div>
          {isInvestment ? (
            <div data-transaction-field="member">
            <FormField
              label="Member"
              required
              error={errors.memberId ? "Required field" : undefined}
            >
              <Select
                {...register("memberId", { required: true })}
                value={memberId}
                onChange={(event) =>
                  setValue("memberId", event.target.value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <option value="" disabled hidden>
                  Select member
                </option>
                {members.map((member) => (
                  <option
                    key={member.id}
                    value={member.id}
                    {...memberOptionProps(member)}
                  >
                    {member.user.name}
                  </option>
                ))}
              </Select>
            </FormField>
            </div>
          ) : null}
          {requiresTelegramChannel ? (
            <div data-transaction-field="channel">
            <FormField
              label={
                isChannelAdvertisingRevenue ? "Revenue channel" : "Channel"
              }
              required={isChannelAdvertisingRevenue}
              error={errors.telegramChannelId ? "Required field" : undefined}
            >
              <Select
                {...register("telegramChannelId", {
                  validate: (value) =>
                    !isChannelAdvertisingRevenue || Boolean(value) || "required",
                })}
                value={telegramChannelId}
                onChange={(event) =>
                  setValue("telegramChannelId", event.target.value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <option value="">No channel</option>
                {ownChannels.map((channel) => (
                  <option
                    key={channel.id}
                    value={channel.id}
                    {...channelOptionProps(channel)}
                  >
                    {channel.title}
                    {channel.username ? ` (@${channel.username})` : ""}
                  </option>
                ))}
              </Select>
            </FormField>
            </div>
          ) : null}
          <div data-transaction-field="account">
          <FormField
            label="Account"
            required
            error={errors.accountId ? "Required field" : undefined}
          >
            <Select
              {...register("accountId", { required: true })}
              value={accountId}
              onChange={(event) =>
                setValue("accountId", event.target.value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <option value="" disabled hidden>
                Select account
              </option>
              {accounts.map((account) => (
                <option
                  key={account.id}
                  value={account.id}
                  {...iconOptionProps(account)}
                >
                  {accountDisplayName(account)} ({account.currency})
                </option>
              ))}
            </Select>
          </FormField>
          </div>
          <div data-transaction-field="amount">
          <FormField label="Amount">
            <Input
              type="number"
              step="0.01"
              {...register("amount", { valueAsNumber: true })}
            />
          </FormField>
          </div>
        </div>
        <FormField label="Description">
          <Input {...register("description")} />
        </FormField>
        <FormField
          label="Date"
          required
          error={errors.date ? "Required field" : undefined}
        >
          <DateInput
            {...register("date", { required: true })}
            value={watch("date")}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
