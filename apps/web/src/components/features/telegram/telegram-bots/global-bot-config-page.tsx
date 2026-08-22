"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BotBillingProviderConfigView,
  FinanceAiConfigView,
} from "@telegram-system/shared";
import {
  Bot,
  Check,
  CircleAlert,
  RefreshCw,
  Star,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Card,
  FormField,
  Input,
  LoadingState,
  PageHeader,
  ToggleRow,
} from "@/components/ui/primitives";
import {
  botBillingApi,
  financeAiConfigApi,
} from "@/lib/features/finance/bot-billing-api";
import { botBillingKeys } from "@/lib/query-keys";
import { StripeWebhookSigningSecretLabel } from "./finance/stripe-webhook-events-tooltip";

type ProviderRow = Awaited<
  ReturnType<typeof botBillingApi.workspaceProviders>
>[number];

export function GlobalBotConfigPage() {
  const providers = useQuery({
    queryKey: botBillingKeys.workspaceProviders(),
    queryFn: botBillingApi.workspaceProviders,
  });
  const ai = useQuery({
    queryKey: botBillingKeys.workspaceFinanceAi(),
    queryFn: financeAiConfigApi.workspace,
  });
  return (
    <AppShell>
      <PageHeader
        title="Global bot configuration"
        subtitle="Workspace defaults inherited by every bot unless you add a bot-specific override."
      />
      {providers.isLoading || ai.isLoading ? (
        <LoadingState text="Loading integrations" />
      ) : null}
      {providers.isError || ai.isError ? (
        <Card className="border-rose-900/70 bg-rose-950/20">
          <p className="text-sm text-rose-200">
            Could not load workspace defaults.
          </p>
          <Button
            className="mt-3"
            variant="secondary"
            onClick={() => {
              void providers.refetch();
              void ai.refetch();
            }}
          >
            <RefreshCw size={16} />
            Retry
          </Button>
        </Card>
      ) : null}
      {providers.data && ai.data ? (
        <div className="space-y-4">
          <StripeSection
            rows={providers.data.filter((row) => row.provider === "STRIPE")}
          />
          <StarsSection
            row={providers.data.find(
              (row) => row.provider === "TELEGRAM_STARS" && row.mode === "LIVE",
            )}
          />
          <AiSection config={ai.data} />
        </div>
      ) : null}
    </AppShell>
  );
}

function IntegrationTitle({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
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

function patchProvider(
  rows: BotBillingProviderConfigView[] | undefined,
  next: BotBillingProviderConfigView,
) {
  if (!rows) return [next];
  return rows.map((row) =>
    row.provider === next.provider && row.mode === next.mode ? next : row,
  );
}

function StripeSection({ rows }: { rows: ProviderRow[] }) {
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
          <StatusBadge
            status={rows.find((row) => row.mode === "TEST")?.status}
          />
          <StatusBadge
            status={rows.find((row) => row.mode === "LIVE")?.status}
          />
        </div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {(["TEST", "LIVE"] as const).map((mode) => (
          <StripeMode
            key={mode}
            mode={mode}
            row={rows.find((row) => row.mode === mode)}
          />
        ))}
      </div>
    </Card>
  );
}

function StripeMode({
  mode,
  row,
}: {
  mode: "TEST" | "LIVE";
  row?: ProviderRow;
}) {
  const qc = useQueryClient();
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const save = useMutation({
    mutationFn: () =>
      botBillingApi.saveWorkspaceProvider("STRIPE", mode, {
        ...(publicKey ? { publicKey } : {}),
        ...(secretKey ? { secretKey } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      }),
    onSuccess: (next) => {
      qc.setQueryData<BotBillingProviderConfigView[]>(
        botBillingKeys.workspaceProviders(),
        (rows) => patchProvider(rows, next),
      );
      setPublicKey("");
      setSecretKey("");
      setWebhookSecret("");
    },
  });
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-white">
            {mode === "TEST" ? "Test mode" : "Live mode"}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500">
            {mode === "TEST"
              ? "Use sandbox keys while testing checkout."
              : "Processes real customer payments."}
          </p>
        </div>
        <StatusBadge status={row?.status} />
      </div>
      <div className="mt-4 space-y-3">
        <FormField label="Publishable key">
          <Input
            type="password"
            value={publicKey}
            onChange={(event) => setPublicKey(event.target.value)}
            placeholder={
              row?.publicKeyConfigured
                ? row.publicKeyMasked || "Configured — leave blank to keep"
                : mode === "TEST"
                  ? "pk_test_…"
                  : "pk_live_…"
            }
          />
        </FormField>
        <FormField label="Secret or restricted key">
          <Input
            type="password"
            value={secretKey}
            onChange={(event) => setSecretKey(event.target.value)}
            placeholder={
              row?.secretKeyConfigured
                ? "Configured — leave blank to keep"
                : mode === "TEST"
                  ? "sk_test_…"
                  : "sk_live_…"
            }
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
            onChange={(event) => setWebhookSecret(event.target.value)}
            placeholder={
              row?.webhookSecretConfigured
                ? "Configured — leave blank to keep"
                : "whsec_…"
            }
          />
        </FormField>
      </div>
      {row?.lastValidationError ? (
        <p className="mt-3 text-xs text-rose-300">{row.lastValidationError}</p>
      ) : null}
      {save.isError ? (
        <p className="mt-3 text-xs text-rose-300">
          Could not save these Stripe credentials. Check the key types and try
          again.
        </p>
      ) : null}
      <Button
        className="mt-4"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Validating…" : "Save and validate"}
      </Button>
    </section>
  );
}

function StarsSection({ row }: { row?: ProviderRow }) {
  const qc = useQueryClient();
  const enabled = row?.status === "CONNECTED";
  const toggle = useMutation({
    mutationFn: (next: boolean) =>
      next
        ? botBillingApi.saveWorkspaceProvider("TELEGRAM_STARS", "LIVE", {})
        : botBillingApi.removeWorkspaceProvider("TELEGRAM_STARS", "LIVE"),
    onSuccess: (next) =>
      qc.setQueryData<BotBillingProviderConfigView[]>(
        botBillingKeys.workspaceProviders(),
        (rows) => patchProvider(rows, next),
      ),
  });
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <IntegrationTitle
          icon={<Star className="fill-amber-300 text-amber-300" size={22} />}
          title="Telegram Stars"
          description="Telegram-native payments for digital products and subscriptions"
        />
        <StatusBadge status={row?.status} />
      </div>
      <ToggleRow
        className="mt-4"
        checked={enabled}
        disabled={toggle.isPending}
        onChange={(next) => toggle.mutate(next)}
        activeTone="blue"
        label="Accept Telegram Stars"
        description="No additional API keys are required; payments use the connected Telegram bot."
      />
      {toggle.isError ? (
        <p className="mt-2 text-xs text-rose-300">
          Could not update Telegram Stars. Please try again.
        </p>
      ) : null}
    </Card>
  );
}

function AiSection({ config }: { config: FinanceAiConfigView }) {
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      await financeAiConfigApi.saveWorkspace({
        ...(apiKey ? { apiKey } : {}),
      });
      return financeAiConfigApi.validateWorkspace();
    },
    onSuccess: (next) => {
      qc.setQueryData(botBillingKeys.workspaceFinanceAi(), next);
      setApiKey("");
    },
  });
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <IntegrationTitle
          icon={<Bot className="text-emerald-300" size={22} />}
          title="OpenAI"
          description="Global AI connection shared by bots in this workspace"
        />
        <StatusBadge status={config.status} />
      </div>
      <div className="mt-5 max-w-3xl">
        <FormField
          label={config.apiKeyConfigured ? "API key (configured)" : "API key"}
        >
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={
              config.apiKeyConfigured
                ? "Leave blank to keep the saved key"
                : "sk-…"
            }
          />
        </FormField>
      </div>
      <div className="mt-3 rounded-lg border border-sky-900/70 bg-sky-950/30 p-3 text-sm text-sky-100">
        <div className="flex gap-2">
          <p>
            Connect the provider once. Each bot feature automatically uses its
            tested model policy, and every request is recorded for cost reporting.
          </p>
        </div>
      </div>
      {config.lastValidationError ? (
        <p className="mt-3 text-xs text-rose-300">
          {config.lastValidationError}
        </p>
      ) : null}
      {save.isError ? (
        <p className="mt-3 text-xs text-rose-300">
          Could not save the OpenAI configuration.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={save.isPending || (!apiKey && !config.apiKeyConfigured)}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Validating…" : "Save and validate"}
        </Button>
      </div>
    </Card>
  );
}
