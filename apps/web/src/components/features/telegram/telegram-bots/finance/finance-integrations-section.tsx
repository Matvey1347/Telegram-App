"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Check, CircleAlert, Star } from "lucide-react";
import type { BotBillingProviderConfigView } from "@telegram-system/shared";
import { Button, Card, Input, ToggleRow } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import {
  botBillingApi,
  financeAiConfigApi,
} from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";

import { FinanceAiSettings } from "./finance-ai-settings";

export function FinanceIntegrationsSection({ botId }: { botId: string }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const providers = useQuery({
    queryKey: botBillingKeys.providers(botId),
    queryFn: () => botBillingApi.providers(botId),
  });
  const aiKey = botBillingKeys.financeAi(botId);
  const ai = useQuery({
    queryKey: aiKey,
    queryFn: () => financeAiConfigApi.get(botId),
  });
  const customAi = ai.data?.source === "BOT_OVERRIDE";
  const overrides =
    providers.data?.filter(
      (row) => row.source === "BOT_OVERRIDE" && row.provider === "STRIPE",
    ) ?? [];
  const reset = useMutation({
    mutationFn: async () => {
      for (const row of overrides)
        await botBillingApi.useGlobalProvider(botId, row.provider, row.mode);
      if (customAi)
        client.setQueryData(aiKey, await financeAiConfigApi.reset(botId));
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: botBillingKeys.providers(botId) }),
  });
  const custom = editing || overrides.length > 0 || customAi;
  return (
    <QueryContentState
      isLoading={providers.isLoading}
      isError={providers.isError}
      isEmpty={!providers.data}
      loadingText="Loading integrations"
      errorText="Could not load integrations."
      emptyText="Integrations are unavailable"
      onRetry={() => {
        void providers.refetch();
      }}
    >
      {providers.data ? (
        <div className="space-y-4">
          <Card>
            <ToggleRow
              label="Custom settings"
              description="Turn off to use Global settings."
              checked={custom}
              disabled={reset.isPending}
              onChange={(value) => {
                setEditing(value);
                if (!value && (overrides.length || customAi)) reset.mutate();
              }}
            />
            {reset.isError && (
              <p role="alert">Could not restore Global settings.</p>
            )}
          </Card>
          <InheritedStripe
            rows={providers.data.filter((row) => row.provider === "STRIPE")}
          />
          {custom &&
            (["TEST", "LIVE"] as const).map((mode) => (
              <StripeOverride key={mode} mode={mode} botId={botId} />
            ))}
          <FinanceAiSettings botId={botId} editable={custom} inline />
          <InheritedStars
            row={providers.data.find(
              (row) => row.provider === "TELEGRAM_STARS" && row.mode === "LIVE",
            )}
          />
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
        Stripe uses the workspace defaults until a custom key is saved for that
        mode.
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
              ? row?.source === "BOT_OVERRIDE"
                ? "Custom settings"
                : "Inherited from global settings"
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
      {row?.webhookPath && (
        <p className="mt-3 break-all text-xs text-neutral-400">
          Webhook: <code>{row.webhookPath}</code>
        </p>
      )}
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

function StripeOverride({
  botId,
  mode,
}: {
  botId: string;
  mode: "TEST" | "LIVE";
}) {
  const client = useQueryClient();
  const [secret, setSecret] = useState("");
  const [webhook, setWebhook] = useState("");
  const save = useMutation({
    mutationFn: () =>
      botBillingApi.saveProvider(botId, "STRIPE", mode, {
        secretKey: secret.trim() || undefined,
        webhookSecret: webhook.trim() || undefined,
      }),
    onSuccess: async () => {
      setSecret("");
      setWebhook("");
      await client.invalidateQueries({
        queryKey: botBillingKeys.providers(botId),
      });
    },
  });
  return (
    <Card className="space-y-3">
      <h3 className="font-medium">Custom Stripe · {mode}</h3>
      <Input
        type="password"
        aria-label={`Stripe ${mode} secret key`}
        placeholder="Secret key"
        value={secret}
        onChange={(event) => setSecret(event.target.value)}
      />
      <Input
        type="password"
        aria-label={`Stripe ${mode} webhook secret`}
        placeholder="Webhook signing secret"
        value={webhook}
        onChange={(event) => setWebhook(event.target.value)}
      />
      <Button
        disabled={save.isPending || !(secret.trim() || webhook.trim())}
        onClick={() => save.mutate()}
      >
        Save {mode}
      </Button>
      {save.isError && (
        <p role="alert" className="text-rose-300">
          Could not save Stripe settings.
        </p>
      )}
    </Card>
  );
}
