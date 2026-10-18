"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CircleAlert, Pencil, RefreshCw } from "lucide-react";
import type {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
} from "@telegram-system/shared";
import type { ReactNode } from "react";
import { Card, Button } from "@/components/ui/primitives";
import { configuredBotsApi } from "@/lib/features/telegram/configured-bots-api";
import { telegramAccountKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { BotRuntimeAvatar } from "./bot-runtime-avatar";
import { BotRuntimeEnvironmentTabs } from "./bot-runtime-environment-tabs";
import { ConfiguredSystemBotProfileModal } from "./configured-system-bot-profile-modal";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
  TelegramCardMenuLink,
} from "../telegram/telegram-card-actions-menu";

export function ConfiguredBotCards() {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [editingEnvironment, setEditingEnvironment] = useState<"LOCAL" | "PRODUCTION" | null>(null);
  const [editingFinanceEnvironment, setEditingFinanceEnvironment] = useState<"LOCAL" | "PRODUCTION" | null>(null);
  const overview = useQuery({
    queryKey: telegramAccountKeys.configuredBots(),
    queryFn: configuredBotsApi.overview,
  });
  const updateFinanceProfile = useMutation({
    mutationFn: (input: { environment: "LOCAL" | "PRODUCTION"; name?: string; description?: string; avatar?: File }) =>
      configuredBotsApi.updateFinanceProfile(input.environment, input),
    onSuccess: (data) => {
      qc.setQueryData(telegramAccountKeys.configuredBots(), data);
      setEditingFinanceEnvironment(null);
      pushToast("Finance bot updated in Telegram.", "success");
    },
    onError: () => pushToast("Could not update the Finance bot.", "error"),
  });
  const updateProfile = useMutation({
    mutationFn: (input: { environment: "LOCAL" | "PRODUCTION"; name?: string; description?: string; avatar?: File }) =>
      configuredBotsApi.updateSystemProfile(input.environment, input),
    onSuccess: (data) => {
      qc.setQueryData(telegramAccountKeys.configuredBots(), data);
      setEditingEnvironment(null);
      pushToast("System bot updated in Telegram.", "success");
    },
    onError: () => pushToast("Could not update the system bot.", "error"),
  });
  if (overview.isLoading) return null;
  if (overview.isError) {
    return (
      <Card className="border-rose-900/70 bg-rose-950/20">
        <p className="text-sm text-rose-200">
          Could not load environment-managed bot analytics.
        </p>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => void overview.refetch()}
        >
          Retry
        </Button>
      </Card>
    );
  }
  if (!overview.data?.systemBot && !overview.data?.financeBot) return null;
  const refresh = async () => {
    await Promise.allSettled([
      configuredBotsApi.refreshSystemAvatars(),
      configuredBotsApi.refreshFinanceAvatars(),
    ]);
    await overview.refetch();
  };
  return (
    <section aria-label="Environment-managed bots" className="space-y-3">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Environment-managed bots
            </h2>
            <p className="text-sm text-neutral-500">
              Profile details are cached locally. Refresh pulls the latest data
              from Telegram.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => void refresh()}
            disabled={overview.isFetching}
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw
                size={15}
                className={overview.isFetching ? "animate-spin" : undefined}
              />
              Refresh
            </span>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {overview.data.systemBot ? (
          <SystemBotCard
            data={overview.data.systemBot}
            avatarRefreshKey={overview.dataUpdatedAt}
            onRefresh={refresh}
            onEdit={setEditingEnvironment}
          />
        ) : null}
        {overview.data.financeBot ? (
          <FinanceBotCard
            data={overview.data.financeBot}
            avatarRefreshKey={overview.dataUpdatedAt}
            onRefresh={refresh}
            onEdit={setEditingFinanceEnvironment}
          />
        ) : null}
      </div>
      {editingEnvironment ? (
        <ConfiguredSystemBotProfileModal
          key={editingEnvironment}
          open
          applicationType="NONE"
          runtimes={overview.data.systemBot?.runtimes ?? []}
          environment={editingEnvironment}
          saving={updateProfile.isPending}
          onClose={() => setEditingEnvironment(null)}
          onEnvironmentChange={(environment) => setEditingEnvironment(environment)}
          onSubmit={(input) => updateProfile.mutate({ environment: editingEnvironment, ...input })}
        />
      ) : null}
      {editingFinanceEnvironment ? (
        <ConfiguredSystemBotProfileModal
          key={editingFinanceEnvironment}
          open
          applicationType="FINANCE"
          runtimes={(overview.data.financeBot?.bots ?? []).map((bot) => ({
            environment: bot.environment,
            username: bot.username,
            name: bot.name,
            description: bot.description,
            avatarUrl: bot.avatarUrl,
          }))}
          environment={editingFinanceEnvironment}
          saving={updateFinanceProfile.isPending}
          onClose={() => setEditingFinanceEnvironment(null)}
          onEnvironmentChange={(environment) => setEditingFinanceEnvironment(environment)}
          onSubmit={(input) => updateFinanceProfile.mutate({ environment: editingFinanceEnvironment, ...input })}
        />
      ) : null}
    </section>
  );
}

function SystemBotCard({
  data,
  avatarRefreshKey,
  onRefresh,
  onEdit,
}: {
  data: NonNullable<
    Awaited<ReturnType<typeof configuredBotsApi.overview>>["systemBot"]
  >;
  avatarRefreshKey: number;
  onRefresh: () => Promise<void>;
  onEdit: (environment: "LOCAL" | "PRODUCTION") => void;
}) {
  const [environment, setEnvironment] = useState<"LOCAL" | "PRODUCTION">(
    data.runtimes.find((runtime) => runtime.selected)?.environment ??
      data.runtimes[0]?.environment ??
      "PRODUCTION",
  );
  const bot = data.runtimes.find(
    (runtime) => runtime.environment === environment,
  );
  return (
    <BotAnalyticsCard
      title={bot?.name || bot?.username || "System Bot"}
      appType="NONE"
      runtimes={data.runtimes}
      environment={environment}
      onEnvironmentChange={setEnvironment}
      avatarRefreshKey={avatarRefreshKey}
      actions={
        <TelegramCardActionsMenu label="System bot actions">
          <TelegramCardMenuAction label="Refresh from Telegram" icon={<RefreshCw size={17} />} onClick={() => void onRefresh()} />
          <TelegramCardMenuAction label="Edit bot" icon={<Pencil size={17} />} onClick={() => onEdit(environment)} />
        </TelegramCardActionsMenu>
      }
    >
      <Metric label="Registered" value={data.analytics.registeredUsers} />
      <Metric label="Enabled" value={data.analytics.enabledUsers} />
      <Metric label="Active · 30 days" value={data.analytics.activeUsers} />
    </BotAnalyticsCard>
  );
}

function FinanceBotCard({
  data,
  avatarRefreshKey,
  onRefresh,
  onEdit,
}: {
  data: NonNullable<
    Awaited<ReturnType<typeof configuredBotsApi.overview>>["financeBot"]
  >;
  avatarRefreshKey: number;
  onRefresh: () => Promise<void>;
  onEdit: (environment: "LOCAL" | "PRODUCTION") => void;
}) {
  const [environment, setEnvironment] = useState<"LOCAL" | "PRODUCTION">(
    data.bots.find((bot) => bot.environment === "LOCAL")?.environment ??
      data.bots[0]?.environment ??
      "LOCAL",
  );
  const bot = data.bots.find((item) => item.environment === environment);
  return (
    <BotAnalyticsCard
      title={bot?.name || bot?.username || "Finance Bot"}
      appType="FINANCE"
      runtimes={data.bots.map((item) => ({
        environment: item.environment,
        username: item.username,
        name: item.name,
        description: item.description,
        avatarUrl: item.avatarUrl,
        configured: true,
        selected: false,
      }))}
      environment={environment}
      onEnvironmentChange={setEnvironment}
      avatarRefreshKey={avatarRefreshKey}
      actions={
        <TelegramCardActionsMenu label="Finance bot actions">
          {bot?.managementBotId ? (
            <TelegramCardMenuLink
              href={`/telegram-bots/${bot.managementBotId}/finance`}
              label="Open Finance admin"
              icon={<BarChart3 size={17} />}
            />
          ) : null}
          <TelegramCardMenuAction label="Refresh analytics" icon={<RefreshCw size={17} />} onClick={() => void onRefresh()} />
          <TelegramCardMenuAction label="Edit bot" icon={<Pencil size={17} />} onClick={() => onEdit(environment)} />
        </TelegramCardActionsMenu>
      }
    >
      {data.status !== "AVAILABLE" ? (
        <p className="col-span-full flex items-center gap-2 text-sm text-amber-200">
          <CircleAlert size={16} /> Finance analytics service is{" "}
          {data.status === "NOT_CONFIGURED" ? "not configured" : null}
          {data.status === "MIGRATION_REQUIRED"
            ? "waiting for the Finance data migration"
            : null}
          {data.status === "UNAVAILABLE" ? "currently unavailable" : null}.
        </p>
      ) : (
        <>
          <Metric label="Registered" value={bot?.registeredUsers ?? 0} />
          <Metric label="Profiles" value={bot?.profiles ?? 0} />
        </>
      )}
    </BotAnalyticsCard>
  );
}

function BotAnalyticsCard({
  title,
  appType,
  runtimes,
  environment,
  onEnvironmentChange,
  avatarRefreshKey,
  actions,
  children,
}: {
  title: string;
  appType: TelegramBotApplicationType;
  runtimes: Array<{
    environment: "LOCAL" | "PRODUCTION";
    username: string | null;
    name: string | null;
    description?: string | null;
    avatarUrl: string | null;
    configured: boolean;
    selected: boolean;
  }>;
  environment: TelegramBotRuntimeEnvironment;
  onEnvironmentChange: (environment: TelegramBotRuntimeEnvironment) => void;
  avatarRefreshKey: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const runtime = runtimes.find((item) => item.environment === environment);
  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
        <BotRuntimeAvatar
          type={appType}
          avatarUrl={runtime?.avatarUrl}
          refreshKey={avatarRefreshKey}
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-white">{title}</h3>
            <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
            appType === "FINANCE"
              ? "border-emerald-800 bg-emerald-950/50 text-emerald-300"
              : "border-sky-800 bg-sky-950/50 text-sky-300"
          }`}>
            {appType === "FINANCE" ? "Finance bot" : "System bot"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {runtime?.username
              ? `@${runtime.username.replace(/^@/, "")}`
              : "Not configured"}
          </p>
        </div>
        </div>
        {actions}
      </div>
      <BotRuntimeEnvironmentTabs
        environment={environment}
        availableEnvironments={runtimes.map((item) => item.environment)}
        onChange={onEnvironmentChange}
      />
      <div className="mt-3 grid gap-3 sm:grid-cols-3">{children}</div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950/50 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-white">
        {value.toLocaleString()}
      </p>
    </div>
  );
}

