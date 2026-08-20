"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  FormField,
  Input,
  Select,
} from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import {
  botBillingApi,
  type BotBillingCouponView,
  type BotBillingPlanView,
} from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";
import { formatBillingMoney, toMinorUnits } from "./finance-billing-format";
export function FinanceMonetizationSection({ botId }: { botId: string }) {
  const plans = useQuery({
    queryKey: botBillingKeys.plans(botId),
    queryFn: () => botBillingApi.plans(botId),
  });
  const coupons = useQuery({
    queryKey: botBillingKeys.coupons(botId),
    queryFn: () => botBillingApi.coupons(botId),
  });
  return (
    <QueryContentState
      isLoading={plans.isLoading || coupons.isLoading}
      isError={plans.isError || coupons.isError}
      isEmpty={!plans.data || !coupons.data}
      loadingText="Loading monetization"
      errorText="Could not load monetization settings."
      emptyText="Monetization settings are unavailable"
      onRetry={() => {
        void plans.refetch();
        void coupons.refetch();
      }}
    >
      {plans.data && coupons.data ? (
        <Monetization botId={botId} plans={plans.data} coupons={coupons.data} />
      ) : null}
    </QueryContentState>
  );
}
function Monetization({
  botId,
  plans,
  coupons,
}: {
  botId: string;
  plans: BotBillingPlanView[];
  coupons: BotBillingCouponView[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("UAH");
  const [interval, setInterval] = useState<"MONTH" | "YEAR">("MONTH");
  const refreshPlans = () =>
    qc.invalidateQueries({ queryKey: botBillingKeys.plans(botId) });
  const createPlan = useMutation({
    mutationFn: () =>
      botBillingApi.createPlan(botId, {
        name,
        code,
        description: description || undefined,
      }),
    onSuccess: refreshPlans,
  });
  const createPrice = useMutation({
    mutationFn: () => {
      const amountMinor = toMinorUnits(amount);
      if (!planId || amountMinor == null)
        return Promise.reject(new Error("Enter a valid amount."));
      return botBillingApi.addPrice(botId, planId, {
        amountMinor,
        currency,
        interval,
      });
    },
    onSuccess: refreshPlans,
  });
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold">New plan</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Input
            aria-label="Plan name"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            aria-label="Plan code"
            placeholder="Code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <Input
            aria-label="Plan description"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Button
          className="mt-3"
          disabled={!name || !code || createPlan.isPending}
          onClick={() => createPlan.mutate()}
        >
          Create plan
        </Button>
      </Card>
      <Card>
        <h2 className="font-semibold">New immutable price version</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Changing a price creates a new version; active subscriptions keep
          their existing price.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Price amount"
            inputMode="decimal"
            placeholder="99.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            aria-label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
          <Select
            value={interval}
            onChange={(e) => setInterval(e.target.value as "MONTH" | "YEAR")}
          >
            <option value="MONTH">Monthly</option>
            <option value="YEAR">Yearly</option>
          </Select>
          <Button
            disabled={!planId || !amount || createPrice.isPending}
            onClick={() => createPrice.mutate()}
          >
            Add version
          </Button>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            coupons={coupons.filter((coupon) => coupon.planId === plan.id)}
            botId={botId}
          />
        ))}
      </div>
      <CouponSection botId={botId} plans={plans} coupons={coupons} />
    </div>
  );
}
function PlanCard({
  plan,
  coupons,
  botId,
}: {
  plan: BotBillingPlanView;
  coupons: BotBillingCouponView[];
  botId: string;
}) {
  return (
    <Card>
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-semibold">{plan.name}</h3>
          <p className="text-xs text-neutral-500">
            {plan.code} · {plan.isActive ? "Active" : "Inactive"}
          </p>
        </div>
      </div>
      {plan.description ? (
        <p className="mt-2 text-sm text-neutral-400">{plan.description}</p>
      ) : null}
      <div className="mt-3 space-y-1 text-sm">
        {plan.prices.map((price) => (
          <p key={price.id}>
            {formatBillingMoney(price.amountMinor, price.currency)} /{" "}
            {price.interval.toLowerCase()} · v{price.version}{" "}
            {price.isPublic ? "public" : "grandfathered"}
          </p>
        ))}
      </div>
      <CouponList coupons={coupons} empty="No plan-specific coupons." />
      <CreateCoupon botId={botId} plans={[plan]} fixedPlanId={plan.id} />
    </Card>
  );
}
function CouponSection({
  botId,
  plans,
  coupons,
}: {
  botId: string;
  plans: BotBillingPlanView[];
  coupons: BotBillingCouponView[];
}) {
  return (
    <Card>
      <h2 className="font-semibold">All plans coupons</h2>
      <CouponList
        coupons={coupons.filter((coupon) => !coupon.planId)}
        empty="No global coupons."
      />
      <CreateCoupon botId={botId} plans={plans} />
    </Card>
  );
}
function CouponList({
  coupons,
  empty,
}: {
  coupons: BotBillingCouponView[];
  empty: string;
}) {
  return coupons.length ? (
    <div className="mt-3 space-y-1 text-sm">
      {coupons.map((coupon) => (
        <p key={coupon.id}>
          {coupon.code} ·{" "}
          {coupon.percentOff
            ? `${coupon.percentOff}% off`
            : formatBillingMoney(
                coupon.amountOffMinor ?? 0,
                coupon.currency,
              )}{" "}
          · {coupon.redemptionCount} used ·{" "}
          {coupon.isActive ? "active" : "inactive"}
        </p>
      ))}
    </div>
  ) : (
    <p className="mt-3 text-sm text-neutral-500">{empty}</p>
  );
}
function CreateCoupon({
  botId,
  plans,
  fixedPlanId,
}: {
  botId: string;
  plans: BotBillingPlanView[];
  fixedPlanId?: string;
}) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [planId, setPlanId] = useState(fixedPlanId ?? "");
  const create = useMutation({
    mutationFn: () =>
      botBillingApi.createCoupon(botId, {
        code,
        percentOff: Number(percent),
        planId: fixedPlanId ?? (planId || undefined),
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: botBillingKeys.coupons(botId) }),
  });
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-4">
      <Input
        aria-label="Coupon code"
        placeholder="Code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <Input
        aria-label="Coupon percent"
        placeholder="Percent off"
        inputMode="numeric"
        value={percent}
        onChange={(e) => setPercent(e.target.value)}
      />
      {fixedPlanId ? (
        <span className="self-center text-xs text-neutral-500">
          Applied to this plan
        </span>
      ) : (
        <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">All plans</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </Select>
      )}
      <Button
        disabled={!code || !percent || create.isPending}
        onClick={() => create.mutate()}
      >
        Create coupon
      </Button>
    </div>
  );
}
