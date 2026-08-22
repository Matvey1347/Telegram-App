"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BotBillingProviderConfigView } from "@telegram-system/shared";
import { Button, Card, FormField, Input } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import {
  botBillingApi,
  financeAiConfigApi,
} from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";
import { StripeWebhookSigningSecretLabel } from "./stripe-webhook-events-tooltip";
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
          <StripeIntegration
            botId={botId}
            rows={providers.data.filter((row) => row.provider === "STRIPE")}
          />
          <StarsIntegration
            botId={botId}
            row={providers.data.find(
              (row) => row.provider === "TELEGRAM_STARS",
            )}
          />
          <FinanceAiIntegration botId={botId} />
        </div>
      ) : null}
    </QueryContentState>
  );
}
function sourceLabel(source: BotBillingProviderConfigView["source"]) {
  return source === "BOT_OVERRIDE"
    ? "Bot override"
    : source === "WORKSPACE_DEFAULT"
      ? "Using global configuration"
      : "Not configured";
}
function StripeIntegration({
  botId,
  rows,
}: {
  botId: string;
  rows: BotBillingProviderConfigView[];
}) {
  return (
    <Card>
      <h2 className="font-semibold">Stripe</h2>
      <p className="text-sm text-neutral-400">
        Card payments and subscriptions
      </p>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {(["TEST", "LIVE"] as const).map((mode) => (
          <StripeMode
            key={mode}
            botId={botId}
            row={rows.find((row) => row.mode === mode)}
            mode={mode}
          />
        ))}
      </div>
    </Card>
  );
}
function StripeMode({
  botId,
  row,
  mode,
}: {
  botId: string;
  row?: BotBillingProviderConfigView;
  mode: "TEST" | "LIVE";
}) {
  const qc = useQueryClient();
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const save = useMutation({
    mutationFn: () =>
      botBillingApi.saveProvider(botId, "STRIPE", mode, {
        ...(publicKey ? { publicKey } : {}),
        ...(secretKey ? { secretKey } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      }),
    onSuccess: () => {
      setPublicKey("");
      setSecretKey("");
      setWebhookSecret("");
      return qc.invalidateQueries({
        queryKey: botBillingKeys.providers(botId),
      });
    },
  });
  const useGlobal = useMutation({
    mutationFn: () => botBillingApi.useGlobalProvider(botId, "STRIPE", mode),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: botBillingKeys.providers(botId) }),
  });
  return (
    <div className="rounded-lg border border-neutral-800 p-3">
      <div className="flex justify-between gap-2">
        <h3 className="font-medium">
          {mode === "TEST" ? "Test mode" : "Live mode"}
        </h3>
        <span className="text-xs text-neutral-500">
          {row?.status ?? "NOT_CONFIGURED"}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {row ? sourceLabel(row.source) : "Not configured"}
      </p>
      <div className="mt-3 space-y-2">
        <FormField
          label={`Publishable key${row?.publicKeyConfigured ? ` (${row.publicKeyMasked ?? "configured"})` : ""}`}
        >
          <Input
            type="password"
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="Leave blank to keep existing"
          />
        </FormField>
        <FormField
          label={`Secret / restricted key${row?.secretKeyConfigured ? " (configured)" : ""}`}
        >
          <Input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder="Leave blank to keep existing"
          />
        </FormField>
        <FormField
          label={
            <StripeWebhookSigningSecretLabel
              configured={row?.webhookSecretConfigured}
            />
          }
        >
          <Input
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Leave blank to keep existing"
          />
        </FormField>
      </div>
      {row?.lastValidationError ? (
        <p className="mt-2 text-xs text-rose-300">{row.lastValidationError}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          Save & validate
        </Button>
        {row?.source === "BOT_OVERRIDE" ? (
          <Button
            variant="secondary"
            disabled={useGlobal.isPending}
            onClick={() => useGlobal.mutate()}
          >
            Use global default
          </Button>
        ) : null}
      </div>
    </div>
  );
}
function StarsIntegration({
  botId,
  row,
}: {
  botId: string;
  row?: BotBillingProviderConfigView;
}) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      botBillingApi.saveProvider(botId, "TELEGRAM_STARS", "LIVE", {}),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: botBillingKeys.providers(botId) }),
  });
  return (
    <Card>
      <h2 className="font-semibold">Telegram Stars</h2>
      <p className="mt-1 text-sm text-neutral-400">
        Telegram-native payments.{" "}
        {row ? sourceLabel(row.source) : "Not configured"}
      </p>
      <Button
        className="mt-3"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {row?.status === "CONNECTED" ? "Validate" : "Enable"}
      </Button>
    </Card>
  );
}
function FinanceAiIntegration({ botId }: { botId: string }) {
  const ai = useQuery({
    queryKey: botBillingKeys.financeAi(botId),
    queryFn: () => financeAiConfigApi.get(botId),
  });
  const config = ai.data;
  return (
    <Card>
      <h2 className="font-semibold">AI provider</h2>
      <p className="mt-1 text-sm text-neutral-400">
        {config
          ? `${config.status === "CONNECTED" ? "Connected" : "Not configured"} · ${config.source === "WORKSPACE_DEFAULT" ? "Using the global OpenAI connection" : "Configure OpenAI in Global bot configuration"}`
          : "Loading"}
      </p>
      {config?.lastValidationError ? (
        <p className="mt-2 text-xs text-rose-300">
          {config.lastValidationError}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-neutral-500">Models are selected automatically per feature. Usage and cost appear in this bot&apos;s Overview for the selected Local or Production runtime.</p>
    </Card>
  );
}
