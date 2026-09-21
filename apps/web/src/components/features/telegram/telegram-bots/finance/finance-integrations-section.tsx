"use client";

import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Check, CircleAlert, Cpu, Star } from "lucide-react";
import type { BotBillingProviderConfigView } from "@telegram-system/shared";
import { Card } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import {
  botBillingApi,
  financeAiConfigApi,
} from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";

export function FinanceIntegrationsSection({ botId }: { botId: string }) {
  const providers = useQuery({
    queryKey: botBillingKeys.providers(botId),
    queryFn: () => botBillingApi.providers(botId),
  });
  const ai = useQuery({
    queryKey: botBillingKeys.financeAi(botId),
    queryFn: () => financeAiConfigApi.get(botId),
  });
  return (
    <QueryContentState
      isLoading={providers.isLoading || ai.isLoading}
      isError={providers.isError || ai.isError}
      isEmpty={!providers.data || !ai.data}
      loadingText="Loading integrations"
      errorText="Could not load integrations."
      emptyText="Integrations are unavailable"
      onRetry={() => {
        void providers.refetch();
        void ai.refetch();
      }}
    >
      {providers.data && ai.data ? (
        <div className="space-y-4">
          <InheritedStripe
            rows={providers.data.filter((row) => row.provider === "STRIPE")}
          />
          <InheritedStars
            row={providers.data.find(
              (row) => row.provider === "TELEGRAM_STARS" && row.mode === "LIVE",
            )}
          />
          <InheritedAi status={ai.data.status} source={ai.data.source} />
        </div>
      ) : null}
    </QueryContentState>
  );
}

function StatusBadge({
  status,
}: {
  status?: "NOT_CONFIGURED" | "CONNECTED" | "INVALID";
}) {
  if (status === "CONNECTED")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950/60 px-2 py-1 text-xs font-medium text-emerald-300">
        <Check size={12} />
        Connected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-rose-900 bg-rose-950/60 px-2 py-1 text-xs font-medium text-rose-300">
      <CircleAlert size={12} />
      {status === "INVALID" ? "Needs attention" : "Not configured"}
    </span>
  );
}

function IntegrationTitle({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950">
        {icon}
      </div>
      <div>
        <h2 className="font-semibold text-white">{title}</h2>
        <p className="mt-0.5 text-sm text-neutral-400">{description}</p>
      </div>
    </div>
  );
}

function InheritedStripe({ rows }: { rows: BotBillingProviderConfigView[] }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <IntegrationTitle
          icon={
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#635bff] text-lg font-bold italic text-white">
              S
            </span>
          }
          title="Stripe"
          description="Card payments and recurring subscriptions"
        />
        <div className="flex gap-2">
          {(["TEST", "LIVE"] as const).map((mode) => (
            <StatusBadge
              key={mode}
              status={rows.find((row) => row.mode === mode)?.status}
            />
          ))}
        </div>
      </div>
      <p className="mt-4 rounded-lg border border-blue-900/70 bg-blue-950/20 px-3 py-2 text-sm text-blue-100">
        This bot inherits Stripe credentials from Global bot configuration.
        Manage keys and validation there.
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {(["TEST", "LIVE"] as const).map((mode) => (
          <InheritedStripeMode
            key={mode}
            mode={mode}
            row={rows.find((row) => row.mode === mode)}
          />
        ))}
      </div>
    </Card>
  );
}

function InheritedStripeMode({
  mode,
  row,
}: {
  mode: "TEST" | "LIVE";
  row?: BotBillingProviderConfigView;
}) {
  const connected = row?.status === "CONNECTED";
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-white">
            {mode === "TEST" ? "Test mode" : "Live mode"}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {mode === "TEST"
              ? "Uses the workspace sandbox connection."
              : "Uses the workspace live connection."}
          </p>
        </div>
        <StatusBadge status={row?.status} />
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <ConfigLine
          label="Configuration"
          value={
            connected
              ? "Inherited from global settings"
              : "No global connection available"
          }
        />
        <ConfigLine
          label="Publishable key"
          value={
            row?.publicKeyConfigured
              ? row.publicKeyMasked || "Configured"
              : "Not configured"
          }
        />
        <ConfigLine
          label="Secret key"
          value={row?.secretKeyConfigured ? "Configured" : "Not configured"}
        />
        <ConfigLine
          label="Webhook signing secret"
          value={row?.webhookSecretConfigured ? "Configured" : "Not configured"}
        />
      </dl>
      {row?.lastValidationError ? (
        <p className="mt-3 text-xs text-rose-300">{row.lastValidationError}</p>
      ) : null}
    </section>
  );
}

function ConfigLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 px-3 py-2">
      <dt className="text-neutral-400">{label}</dt>
      <dd className="truncate text-right text-neutral-200">{value}</dd>
    </div>
  );
}

function InheritedStars({ row }: { row?: BotBillingProviderConfigView }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <IntegrationTitle
          icon={<Star size={20} className="text-amber-300" />}
          title="Telegram Stars"
          description="Telegram-native payments"
        />
        <StatusBadge status={row?.status} />
      </div>
      <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-300">
        {row?.status === "CONNECTED"
          ? "Connected through the global bot configuration."
          : "Not configured in global bot configuration."}
      </p>
    </Card>
  );
}

function InheritedAi({
  status,
  source,
}: {
  status: "NOT_CONFIGURED" | "CONNECTED" | "INVALID";
  source: string;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <IntegrationTitle
          icon={<Cpu size={20} className="text-sky-300" />}
          title="AI provider"
          description="AI models used by Finance Bot"
        />
        <StatusBadge status={status} />
      </div>
      <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-sm text-neutral-300">
        {source === "WORKSPACE_DEFAULT"
          ? "Connected through the global OpenAI configuration. Models are selected automatically per feature."
          : "No global OpenAI connection is available for this bot."}
      </p>
    </Card>
  );
}
