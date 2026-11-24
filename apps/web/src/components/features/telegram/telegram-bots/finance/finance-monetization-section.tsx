"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, Input, Select } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import {
  botBillingApi,
  type BotBillingCouponView,
  type BotBillingPlanView,
} from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";
import { formatBillingMoney } from "./finance-billing-format";
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
  const [tab, setTab] = useState<"plans" | "coupons">("plans");
  const plus = plans.find((plan) => plan.code === "PRO");
  return (
    <div className="space-y-4">
      <div className="flex gap-2" aria-label="Monetization">
        <Button
          variant={tab === "plans" ? undefined : "secondary"}
          onClick={() => setTab("plans")}
        >
          Plans
        </Button>
        <Button
          variant={tab === "coupons" ? undefined : "secondary"}
          onClick={() => setTab("coupons")}
        >
          Coupons
        </Button>
      </div>
      {tab === "plans" ? (
        <Card>
          <h2 className="font-semibold">Groshly PLUS</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Plans sync automatically with connected Stripe accounts.
          </p>
          <div className="mt-4 space-y-2">
            {plus?.prices
              .filter((price) => price.isPublic && price.currency === "UAH")
              .map((price) => (
                <div
                  key={price.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-800 p-3"
                >
                  <div>
                    <p className="font-medium">
                      {price.interval === "DAY"
                        ? "7 days, then monthly"
                        : price.interval === "YEAR"
                          ? "12 months"
                          : price.intervalCount === 1
                            ? "1 month"
                            : "3 months"}
                    </p>
                    <p className="text-sm text-neutral-400">
                      {formatBillingMoney(price.amountMinor, price.currency)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["TEST", "LIVE"] as const).map((mode) => (
                      <span
                        key={mode}
                        className="rounded-full border border-neutral-700 px-2 py-1 text-xs"
                      >
                        {mode} ·{" "}
                        {price.stripeSynced?.includes(mode)
                          ? "Synced"
                          : "Not synced"}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            {!plus?.prices.some((price) => price.isPublic) && (
              <p className="text-sm text-neutral-400">
                Preparing the plan catalog. Refresh to check again.
              </p>
            )}
          </div>
        </Card>
      ) : (
        <CouponSection botId={botId} plans={plans} coupons={coupons} />
      )}
    </div>
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
      <h2 className="font-semibold">Coupons</h2>
      <CouponList coupons={coupons} empty="No coupons yet." />
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
