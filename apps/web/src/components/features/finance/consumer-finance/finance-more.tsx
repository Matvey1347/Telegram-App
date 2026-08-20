"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConsumerFinanceAccount,
  ConsumerFinanceCategory,
  ConsumerFinanceDashboard,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  FormField,
  Input,
  Select,
} from "@/components/ui/primitives";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/query-keys";
export function FinanceMore({
  botId,
  categories,
  dashboard,
}: {
  botId: string;
  accounts: ConsumerFinanceAccount[];
  categories: ConsumerFinanceCategory[];
  dashboard: ConsumerFinanceDashboard;
}) {
  const client = useQueryClient();
  const [category, setCategory] = useState("");
  const [categoryType, setCategoryType] =
    useState<ConsumerFinanceCategory["type"]>("EXPENSE");
  const [goal, setGoal] = useState("");
  const [target, setTarget] = useState("");
  const [reminder, setReminder] = useState("");
  const [reminderAmount, setReminderAmount] = useState("");
  const [reminderDay, setReminderDay] = useState("1");
  const [currency, setCurrency] = useState(dashboard.profile.defaultCurrency);
  const [timezone, setTimezone] = useState(dashboard.profile.timezone);
  const [couponCode, setCouponCode] = useState("");
  const [destroy, setDestroy] = useState(false);
  const reminders = useQuery({
    queryKey: consumerFinanceKeys.reminders(botId),
    queryFn: () => consumerFinanceApi.reminders(botId),
  });
  const billing = useQuery({
    queryKey: consumerFinanceKeys.billing(botId),
    queryFn: () => consumerFinanceApi.billing(botId),
  });
  const addCategory = useMutation({
    mutationFn: () =>
      consumerFinanceApi.createCategory(botId, {
        name: category,
        type: categoryType,
      }),
    onSuccess: (item) => {
      client.setQueryData(
        consumerFinanceKeys.categories(botId),
        (items: ConsumerFinanceCategory[] | undefined) => [
          ...(items ?? []),
          item,
        ],
      );
      setCategory("");
    },
  });
  const archiveCategory = useMutation({
    mutationFn: (id: string) =>
      consumerFinanceApi.archiveCategory(botId, id),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.categories(botId),
      }),
  });
  const deactivateGoal = useMutation({
    mutationFn: (id: string) =>
      consumerFinanceApi.deleteGoal(botId, id),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      }),
  });
  const addGoal = useMutation({
    mutationFn: () =>
      consumerFinanceApi.saveGoal(botId, {
        name: goal,
        targetAmount: target,
        currentAmount: "0",
        currency: dashboard.profile.defaultCurrency,
      }),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      }),
  });
  const addReminder = useMutation({
    mutationFn: () =>
      consumerFinanceApi.createReminder(botId, {
        name: reminder,
        amount: reminderAmount,
        currency: dashboard.profile.defaultCurrency,
        dayOfMonth: Number(reminderDay),
      }),
    onSuccess: (item) => {
      client.setQueryData(
        consumerFinanceKeys.reminders(botId),
        (items: typeof reminders.data) => [...(items ?? []), item],
      );
      setReminder("");
      setReminderAmount("");
    },
  });
  const deleteData = useMutation({
    mutationFn: () => consumerFinanceApi.deleteData(botId),
    onSuccess: () => client.clear(),
  });
  const saveSettings = useMutation({
    mutationFn: () => consumerFinanceApi.updateSettings(botId, { defaultCurrency: currency, timezone }),
    onSuccess: () => void client.invalidateQueries({ queryKey: consumerFinanceKeys.dashboard(botId) }),
  });
  const checkout = useMutation({
    mutationFn: (input: { provider: "STRIPE" | "TELEGRAM_STARS"; priceId: string; mode?: string }) =>
      consumerFinanceApi.checkout(botId, input.provider, input.priceId, input.mode, couponCode),
    onSuccess: ({ url }) => { window.location.href = url; },
  });
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-medium">Categories</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Select
            aria-label="Category type"
            value={categoryType}
            onChange={(event) =>
              setCategoryType(
                event.target.value as ConsumerFinanceCategory["type"],
              )
            }
          >
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </Select>
          <Input
            aria-label="New category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="New category"
          />
          <Button
            disabled={!category || addCategory.isPending}
            onClick={() => addCategory.mutate()}
          >
            Add
          </Button>
        </div>
        <div className="mt-3 space-y-1 text-sm text-neutral-400">
          {categories.filter((item) => !item.archivedAt).length ? (
            categories
              .filter((item) => !item.archivedAt)
              .map((item) => (
                <div key={item.id} className="flex justify-between">
                  <span>
                    {item.type === "EXPENSE" ? "Expense" : "Income"} ·{" "}
                    {item.name}
                  </span>
                  <button
                    className="text-rose-300"
                    disabled={archiveCategory.isPending}
                    onClick={() => archiveCategory.mutate(item.id)}
                  >
                    Archive
                  </button>
                </div>
              ))
          ) : (
            <p>No categories yet.</p>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="font-medium">Goal</h2>
        {dashboard.goal ? (
          <>
            <p className="mt-2 text-sm">
              {dashboard.goal.name}: {dashboard.goal.currentAmount} /{" "}
              {dashboard.goal.targetAmount} {dashboard.goal.currency}
            </p>
            <Button
              className="mt-2"
              variant="secondary"
              disabled={deactivateGoal.isPending}
              onClick={() => deactivateGoal.mutate(dashboard.goal!.id)}
            >
              Deactivate goal
            </Button>
          </>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Goal name"
            />
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="decimal"
              placeholder="Target"
            />
            <Button
              disabled={!goal || !target || addGoal.isPending}
              onClick={() => addGoal.mutate()}
            >
              Create goal
            </Button>
          </div>
        )}
      </Card>
      <Card>
        <h2 className="font-medium">Reminders</h2>
        <div className="mt-2 flex gap-2">
          <Input
            value={reminder}
            onChange={(e) => setReminder(e.target.value)}
            placeholder="Monthly reminder"
          />
          <Input value={reminderAmount} onChange={(e) => setReminderAmount(e.target.value)} inputMode="decimal" placeholder={`Amount (${dashboard.profile.defaultCurrency})`} />
          <Input value={reminderDay} onChange={(e) => setReminderDay(e.target.value)} inputMode="numeric" placeholder="Day of month" />
          <Button
            disabled={!reminder || !reminderAmount || !Number(reminderDay) || addReminder.isPending}
            onClick={() => addReminder.mutate()}
          >
            Add
          </Button>
        </div>
        <div className="mt-2 space-y-1 text-xs text-neutral-400">{reminders.data?.length ? reminders.data.map((item) => <p key={item.id}>{item.name} · {item.amount} {item.currency} · day {item.dayOfMonth} · {item.enabled ? "Active" : "Paused"}</p>) : <p>No reminders.</p>}</div>
      </Card>
      <Card>
        <h2 className="font-medium">Finance Pro</h2>
        <p className="mt-1 text-sm text-neutral-400">
          {billing.data?.subscriptions.some((item) => item.status === "ACTIVE")
            ? "Finance Pro is active."
            : "Unlock smart limits with Pro."}
        </p>
        <Input className="mt-2" aria-label="Coupon code" value={couponCode} onChange={(event) => setCouponCode(event.target.value.toUpperCase())} placeholder="Coupon code (Stripe)" />
        {billing.data?.plans.flatMap((plan) =>
          plan.prices.map((price) => (
            <div key={price.id} className="mt-2 flex items-center justify-between gap-2 text-xs text-neutral-400"><span>{plan.name} · {price.amountMinor / (price.currency === "XTR" ? 1 : 100)} {price.currency} / {price.interval.toLowerCase()}</span><span className="flex gap-1">{billing.data?.providers.filter((provider) => provider.capabilities.intervals.includes(price.interval) && (provider.provider !== "TELEGRAM_STARS" || price.currency === "XTR")).map((provider) => <Button key={provider.provider} disabled={checkout.isPending} onClick={() => checkout.mutate({ provider: provider.provider, priceId: price.id, mode: provider.mode })}>{provider.provider === "STRIPE" ? "Card" : "Stars"}</Button>)}</span></div>
          )),
        )}
      </Card>
      <Card>
        <h2 className="font-medium">Settings & privacy</h2>
        <p className="mt-1 text-sm text-neutral-400">
          Default currency: {dashboard.profile.defaultCurrency} ·{" "}
          {dashboard.profile.timezone}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2"><Input aria-label="Default currency" value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} maxLength={3} /><Input aria-label="Timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} /><Button disabled={!currency || !timezone || saveSettings.isPending} onClick={() => saveSettings.mutate()}>{saveSettings.isPending ? "Saving…" : "Save settings"}</Button></div>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() =>
            consumerFinanceApi.exportData(botId).then((data) => {
              const link = document.createElement("a");
              link.href = URL.createObjectURL(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
              );
              link.download = "finance-export.json";
              link.click();
              URL.revokeObjectURL(link.href);
            })
          }
        >
          Export data
        </Button>
        <Button
          className="mt-3"
          variant="danger"
          onClick={() => setDestroy(true)}
        >
          Delete finance data
        </Button>
      </Card>
      <ConfirmDeleteModal
        open={destroy}
        onClose={() => setDestroy(false)}
        onConfirm={() => deleteData.mutateAsync()}
        entityName="DELETE MY FINANCE DATA"
        label="Delete all data"
        description="This permanently deletes your finance profile and records."
      />
    </div>
  );
}
