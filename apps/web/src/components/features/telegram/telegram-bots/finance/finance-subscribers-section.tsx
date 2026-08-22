"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BotBillingUserPage,
  TelegramBotRuntimeEnvironment,
} from "@telegram-system/shared";
import { Gift, Search, Settings2, UserRound } from "lucide-react";
import {
  Button,
  Card,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import {
  botBillingApi,
  type BotBillingUsersQuery,
} from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";
import { formatBillingDate } from "./finance-billing-format";
import { financeAdminTimezoneOptions } from "@/lib/features/finance/finance-admin-timezones";

type FinanceUser = BotBillingUserPage["items"][number];

export function FinanceSubscribersSection({
  botId,
  environment,
}: {
  botId: string;
  environment: TelegramBotRuntimeEnvironment;
}) {
  const [query, setQuery] = useState<BotBillingUsersQuery>({ environment });
  const [history, setHistory] = useState<string[]>([]);
  const [selected, setSelected] = useState<FinanceUser | null>(null);
  const effectiveQuery = { ...query, environment };
  const users = useQuery({
    queryKey: botBillingKeys.users(botId, effectiveQuery),
    queryFn: () => botBillingApi.users(botId, effectiveQuery),
  });
  const next = () => {
    if (!users.data?.nextCursor) return;
    setHistory((value) => [...value, query.cursor ?? ""]);
    setQuery((value) => ({ ...value, cursor: users.data!.nextCursor! }));
  };
  const previous = () => {
    const cursor = history.at(-1);
    setHistory((value) => value.slice(0, -1));
    setQuery((value) => ({ ...value, cursor: cursor || undefined }));
  };
  return (
    <div className="space-y-4">
      <Card className="p-3">
        <label className="relative block max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            size={16}
          />
          <Input
            className="pl-9"
            value={query.search ?? ""}
            onChange={(event) => {
              setHistory([]);
              setQuery({
                environment,
                search: event.target.value || undefined,
              });
            }}
            placeholder="Search by name, username, or Telegram ID"
          />
        </label>
      </Card>
      <QueryContentState
        isLoading={users.isLoading}
        isError={users.isError}
        isEmpty={!users.data?.items.length}
        loadingText="Loading Finance users"
        errorText="Could not load Finance users."
        emptyText={`No users in the ${environment === "LOCAL" ? "local" : "production"} bot`}
        onRetry={() => void users.refetch()}
      >
        <div className="grid gap-3 xl:grid-cols-2">
          {users.data?.items.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onManage={() => setSelected(user)}
            />
          ))}
        </div>
      </QueryContentState>
      {users.data ? (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={!history.length || users.isFetching}
            onClick={previous}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={!users.data.nextCursor || users.isFetching}
            onClick={next}
          >
            Next
          </Button>
        </div>
      ) : null}
      <UserSupportModal
        key={selected?.id ?? "closed"}
        botId={botId}
        user={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

function UserCard({
  user,
  onManage,
}: {
  user: FinanceUser;
  onManage: () => void;
}) {
  const name = user.username
    ? `@${user.username}`
    : [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.telegramUserId;
  return (
    <Card className="flex items-center gap-3 p-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-950 text-xl"
        aria-hidden
      >
        {user.subscription ? "💎" : "👤"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{name}</p>
        <p className="truncate text-xs text-neutral-500">
          ID {user.telegramUserId} ·{" "}
          {user.profile?.locale.toUpperCase() ?? "NO PROFILE"} · seen{" "}
          {formatBillingDate(user.lastInteractionAt)}
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          {user.subscription
            ? `${user.subscription.plan?.name ?? "Subscription"} · ${user.subscription.status}`
            : "Free user"}
          {user.profile && !user.profile.onboardingCompleted
            ? " · onboarding incomplete"
            : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onManage}
        aria-label={`Manage ${name}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
      >
        <Settings2 size={17} />
      </button>
    </Card>
  );
}

function UserSupportModal({
  botId,
  user,
  onClose,
}: {
  botId: string;
  user: FinanceUser | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const [planId, setPlanId] = useState("");
  const [duration, setDuration] = useState("30");
  const [locale, setLocale] = useState(user?.profile?.locale ?? "en");
  const [currency, setCurrency] = useState(
    user?.profile?.defaultCurrency ?? "UAH",
  );
  const [timezone, setTimezone] = useState(
    user?.profile?.timezone ?? "Europe/Warsaw",
  );
  const timezoneOptions = financeAdminTimezoneOptions(timezone);
  const plans = useQuery({
    queryKey: botBillingKeys.plans(botId),
    queryFn: () => botBillingApi.plans(botId),
    enabled: Boolean(user),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: botBillingKeys.root(botId) });
  const grant = useMutation({
    mutationFn: () => {
      if (!user || !planId) throw new Error("Select a plan");
      const expiresAt =
        duration === "never"
          ? undefined
          : new Date(Date.now() + Number(duration) * 86_400_000).toISOString();
      return botBillingApi.grant(botId, {
        telegramBotUserId: user.id,
        planId,
        source: "GIFT",
        reason: "Support gift from Finance admin",
        idempotencyKey: crypto.randomUUID(),
        expiresAt,
      });
    },
    onSuccess: refresh,
  });
  const repair = useMutation({
    mutationFn: ({ resetOnboarding }: { resetOnboarding: boolean }) => {
      if (!user) throw new Error("User is required");
      return botBillingApi.updateUserProfile(botId, user.id, {
        locale: locale as "uk" | "ru" | "en",
        currency,
        timezone,
        resetOnboarding,
      });
    },
    onSuccess: refresh,
  });
  const displayName = user?.username
    ? `@${user.username}`
    : user?.firstName || "Finance user";
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={`Support · ${displayName}`}
    >
      <div className="space-y-5">
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Gift size={17} className="text-sky-300" />
            <h3 className="font-medium">Gift subscription</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <FormField label="Plan">
              <Select
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
              >
                <option value="">Select plan</option>
                {plans.data
                  ?.filter((plan) => plan.isActive)
                  .map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
              </Select>
            </FormField>
            <FormField label="Access duration">
              <Select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              >
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
                <option value="never">No expiry</option>
              </Select>
            </FormField>
          </div>
          <Button
            className="mt-2"
            disabled={!planId || grant.isPending}
            onClick={() => grant.mutate()}
          >
            {grant.isPending ? "Granting…" : "Gift access"}
          </Button>
          {grant.isError ? (
            <p className="mt-2 text-sm text-rose-300">
              Could not grant access.
            </p>
          ) : null}
        </section>
        <section className="border-t border-neutral-800 pt-4">
          <div className="mb-2 flex items-center gap-2">
            <UserRound size={17} className="text-sky-300" />
            <h3 className="font-medium">Repair Finance profile</h3>
          </div>
          {user?.profile ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                <FormField label="Language">
                  <Select
                    value={locale}
                    onChange={(event) => setLocale(event.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="ru">Русский</option>
                    <option value="uk">Українська</option>
                  </Select>
                </FormField>
                <FormField label="Currency">
                  <Input
                    maxLength={3}
                    value={currency}
                    onChange={(event) =>
                      setCurrency(event.target.value.toUpperCase())
                    }
                  />
                </FormField>
                <FormField label="Timezone">
                  <Select
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                  >
                    {timezoneOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  disabled={repair.isPending}
                  onClick={() => repair.mutate({ resetOnboarding: false })}
                >
                  Save profile
                </Button>
                <Button
                  variant="secondary"
                  disabled={repair.isPending}
                  onClick={() => repair.mutate({ resetOnboarding: true })}
                >
                  Reset onboarding
                </Button>
              </div>
              {repair.isError ? (
                <p className="mt-2 text-sm text-rose-300">
                  Could not update the profile. Check currency and timezone.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-neutral-400">
              The user has not opened Finance yet, so there is no profile to
              repair.
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}
