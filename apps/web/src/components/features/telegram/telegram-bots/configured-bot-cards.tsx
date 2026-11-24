"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, RefreshCw } from "lucide-react";
import type {
  SupportBotView,
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
} from "../telegram/telegram-card-actions-menu";

import { BotSupportPanel } from "./telegram-support-inbox";
import { BotAudienceMetrics } from "./bot-audience-metrics";
import { SupportBotIdentity } from "./support-bot-identity";

export function ConfiguredBotCards({
  support,
  children,
}: {
  support?: SupportBotView;
  children?: ReactNode;
}) {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [editingEnvironment, setEditingEnvironment] = useState<
    "LOCAL" | "PRODUCTION" | null
  >(null);
  const overview = useQuery({
    queryKey: telegramAccountKeys.configuredBots(),
    queryFn: configuredBotsApi.overview,
  });
  const updateProfile = useMutation({
    mutationFn: (input: {
      environment: "LOCAL" | "PRODUCTION";
      name?: string;
      description?: string;
    }) => configuredBotsApi.updateSystemProfile(input.environment, input),
    onSuccess: (data) => {
      qc.setQueryData(telegramAccountKeys.configuredBots(), data);
      setEditingEnvironment(null);
      pushToast("System bot updated in Telegram.", "success");
    },
    onError: () => pushToast("Could not update the system bot.", "error"),
  });
  const systemBot = overview.data?.systemBot;
  if (!children && !overview.isError && !systemBot?.runtimes.length)
    return null;
  const refresh = async () => {
    await configuredBotsApi.refreshSystemAvatars();
    await overview.refetch();
  };
  return (
    <section aria-label="Environment-managed bots" className="space-y-3">
      <h2 className="text-lg font-semibold text-white">
        Environment-managed bots
      </h2>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {systemBot?.runtimes.length ? (
          <SystemBotCard
            data={systemBot}
            avatarRefreshKey={overview.dataUpdatedAt}
            onRefresh={refresh}
            onEdit={setEditingEnvironment}
            support={support}
          />
        ) : overview.isError ? (
          <Card className="border-rose-900/70 bg-rose-950/20">
            <p className="text-sm text-rose-200">
              Could not load system bot analytics.
            </p>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => void overview.refetch()}
            >
              Retry
            </Button>
          </Card>
        ) : null}
        {children}
      </div>
      {editingEnvironment ? (
        <ConfiguredSystemBotProfileModal
          key={editingEnvironment}
          open
          applicationType="NONE"
          runtimes={systemBot?.runtimes ?? []}
          environment={editingEnvironment}
          saving={updateProfile.isPending}
          onClose={() => setEditingEnvironment(null)}
          onEnvironmentChange={(environment) =>
            setEditingEnvironment(environment)
          }
          onSubmit={(input) =>
            updateProfile.mutate({ environment: editingEnvironment, ...input })
          }
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
  support,
}: {
  data: NonNullable<
    Awaited<ReturnType<typeof configuredBotsApi.overview>>["systemBot"]
  >;
  avatarRefreshKey: number;
  onRefresh: () => Promise<void>;
  support?: SupportBotView;
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
      support={support}
      actions={
        <TelegramCardActionsMenu label="System bot actions">
          <TelegramCardMenuAction
            label="Refresh from Telegram"
            icon={<RefreshCw size={17} />}
            onClick={() => void onRefresh()}
          />
          <TelegramCardMenuAction
            label="Edit bot"
            icon={<Pencil size={17} />}
            onClick={() => onEdit(environment)}
          />
        </TelegramCardActionsMenu>
      }
    >
      <BotAudienceMetrics
        label="System bot audience"
        registered={data.analytics.registeredUsers}
        active={data.analytics.activeUsers}
      />
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
  support,
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
  support?: SupportBotView;
  children: ReactNode;
}) {
  const runtime = runtimes.find((item) => item.environment === environment);
  const [supportSelected, setSupportSelected] = useState(false);
  const showSupport = supportSelected;
  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-950 p-3 shadow-sm">
      {showSupport ? (
        <SupportBotIdentity product="NEXELOQ" bot={support} />
      ) : (
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
                <span
                  className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                    appType === "FINANCE"
                      ? "border-emerald-800 bg-emerald-950/50 text-emerald-300"
                      : "border-sky-800 bg-sky-950/50 text-sky-300"
                  }`}
                >
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
      )}
      <BotRuntimeEnvironmentTabs
        environment={environment}
        availableEnvironments={runtimes.map((item) => item.environment)}
        onChange={(next) => {
          onEnvironmentChange(next);
          setSupportSelected(false);
        }}
        support={{
          selected: supportSelected,
          open: support?.open,
          needsReply: support?.needsReply,
          onSelect: () => setSupportSelected(true),
        }}
      />
      {showSupport ? (
        <BotSupportPanel bot={support} />
      ) : (
        <div className="mt-3">{children}</div>
      )}
    </article>
  );
}
