"use client";

import Link from "next/link";
import { useState, type PropsWithChildren, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bot,
  CheckCircle2,
  Handshake,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Settings,
  Trash2,
  Wallet,
  Webhook,
} from "lucide-react";
import type {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeSummary,
} from "@telegram-system/shared";
import type { TelegramBot } from "@/lib/api";
import { Button, Tooltip } from "@/components/ui/primitives";
import { runtimeAppPresentation } from "./runtime-app-presentation";

export function BotCardShell({
  bot,
  checkingEnvironment,
  onCheck,
  onDelete,
  onSwitch,
  onConfigureRuntime,
  onRemoveRuntime,
  children,
}: PropsWithChildren<{
  bot: TelegramBot;
  checkingEnvironment: TelegramBotRuntimeEnvironment | null;
  onCheck: (environment: TelegramBotRuntimeEnvironment) => void;
  onDelete: () => void;
  onSwitch: () => void;
  onConfigureRuntime: (environment: TelegramBotRuntimeEnvironment) => void;
  onRemoveRuntime: (environment: TelegramBotRuntimeEnvironment) => void;
}>) {
  const [environment, setEnvironment] =
    useState<TelegramBotRuntimeEnvironment>("PRODUCTION");
  const runtime = bot.runtimes.find((item) => item.environment === environment);
  const appType = bot.applicationType;
  const currentApp = bot.applications.find((option) => option.type === appType);
  const configureHref =
    appType === "GREETER"
      ? `/telegram-bots/${bot.id}/greeter`
      : appType === "FINANCE"
        ? `/telegram-bots/${bot.id}/finance`
        : null;

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AppIcon type={appType} />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-white">
              {runtime?.firstName || bot.label}
            </h3>
            <p className="truncate text-sm text-neutral-400">
              {runtime?.username
                ? `@${runtime.username.replace(/^@/, "")}`
                : runtime
                  ? "No public username"
                  : "Local test bot is not configured"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CardAction
            label={
              checkingEnvironment === environment ? "Checking bot" : "Check bot"
            }
            disabled={!runtime || checkingEnvironment === environment}
            onClick={() => onCheck(environment)}
          >
            {checkingEnvironment === environment ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
          </CardAction>
          <CardAction
            label={runtime ? "Update runtime token" : "Configure runtime"}
            onClick={() => onConfigureRuntime(environment)}
          >
            <Pencil size={16} />
          </CardAction>
          <CardAction label="Change bot app" onClick={onSwitch}>
            <ArrowLeftRight data-testid="change-bot-app-icon" size={16} />
          </CardAction>
          {configureHref ? (
            <Link
              href={configureHref}
              aria-label={`Configure ${currentApp?.label || applicationLabel(appType)}`}
              title={`Configure ${currentApp?.label || applicationLabel(appType)}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Settings data-testid="configure-bot-app-icon" size={16} />
            </Link>
          ) : null}
          <CardAction label="Delete bot" tone="danger" onClick={onDelete}>
            <Trash2 size={16} />
          </CardAction>
        </div>
      </div>
      <div
        className="mt-3 inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-0.5"
        role="tablist"
        aria-label="Bot runtime environment"
      >
        {(["PRODUCTION", "LOCAL"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={environment === option}
            onClick={() => setEnvironment(option)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${environment === option ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
          >
            {option === "PRODUCTION" ? "Production" : "Local"}
          </button>
        ))}
      </div>
      {runtime ? (
        <RuntimeDetails runtime={runtime} appType={appType} />
      ) : (
        <RuntimeSetupState
          environment={environment}
          onConfigure={() => onConfigureRuntime(environment)}
        />
      )}
      {runtime ? (
        <div className="mt-3 border-t border-neutral-800 pt-3">
          {children}
        </div>
      ) : null}
      {runtime?.environment === "LOCAL" ? (
        <div className="mt-3 flex justify-end border-t border-neutral-800 pt-3">
          <Button variant="danger" onClick={() => onRemoveRuntime("LOCAL")}>
            Remove local runtime
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function RuntimeSetupState({
  environment,
  onConfigure,
}: {
  environment: TelegramBotRuntimeEnvironment;
  onConfigure: () => void;
}) {
  const local = environment === "LOCAL";
  return (
    <div className="mt-3 rounded-lg border border-dashed border-neutral-700 bg-neutral-900/60 p-3">
      <p className="text-sm font-medium text-neutral-100">
        {local
          ? "Local bot is not configured"
          : "Production bot is not configured"}
      </p>
      <p className="mt-1 text-xs text-neutral-400">
        {local
          ? "Connect a separate BotFather test token for this machine. It is kept separate from production."
          : "Connect the production BotFather token to make this runtime available."}
      </p>
      <Button className="mt-3" onClick={onConfigure}>
        {local ? "Connect local test bot" : "Connect production bot"}
      </Button>
    </div>
  );
}
function RuntimeDetails({
  runtime,
  appType,
}: {
  runtime: TelegramBotRuntimeSummary;
  appType: TelegramBotApplicationType;
}) {
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusBadge tone={runtimeTone(runtime.runtimeStatus)}>
          <CheckCircle2 size={13} />
          {runtime.runtimeStatus}
        </StatusBadge>
        <Tooltip content={webhookTooltip(runtime)}>
          <StatusBadge tone={webhookTone(runtime.webhookConnectionStatus)}>
            <Webhook size={13} />
            {webhookLabel(runtime)}
          </StatusBadge>
        </Tooltip>
        <StatusBadge tone={appType === "NONE" ? "muted" : "info"}>
          {runtimeAppPresentation(appType).emoji} {applicationLabel(appType)}
        </StatusBadge>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        <RuntimeField
          label="Webhook endpoint"
          value={runtime.webhookUrl || "Not configured"}
        />
        <RuntimeField
          label="Last checked"
          value={formatDate(runtime.lastCheckedAt)}
        />
        <RuntimeField
          label="Last real update"
          value={formatDate(runtime.lastUpdateProcessedAt)}
        />
        <RuntimeField label="Web App" value={webAppLabel(runtime, appType)} />
        <RuntimeField
          label="Telegram Mini App"
          value={miniAppLabel(runtime, appType)}
        />
      </dl>
      {runtime.environment === "PRODUCTION" && runtime.runtimeStatus !== "ACTIVE" ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-100">
          Production token is saved. Deploy the production API with its public webhook URL to activate this runtime.
        </p>
      ) : null}
      {runtime.environment === "LOCAL" && runtime.runtimeStatus !== "ACTIVE" ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-100">
          Local token is saved. Set a reachable local webhook URL to activate this runtime.
        </p>
      ) : null}
      {runtime.lastRuntimeError || runtime.lastErrorMessage ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-sm text-rose-100">
          <AlertTriangle className="mt-0.5 shrink-0" size={16} />
          <span className="min-w-0 break-words">
            {runtime.lastRuntimeError || runtime.lastErrorMessage}
          </span>
        </div>
      ) : null}
    </>
  );
}
function RuntimeField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-neutral-200">{value}</dd>
    </div>
  );
}
function webAppLabel(
  runtime: TelegramBotRuntimeSummary,
  appType: TelegramBotApplicationType,
) {
  if (appType !== "FINANCE") return "Not applicable";
  if (!runtime.webApp || runtime.webApp.status === "UNKNOWN")
    return "Not checked yet";
  return runtime.webApp.status === "ERROR"
    ? `Error${runtime.webApp.error ? ` · ${runtime.webApp.error}` : ""}`
    : `${runtime.webApp.status === "AVAILABLE" ? "Available" : "Not configured"}${runtime.webApp.url ? ` · ${runtime.webApp.url}` : ""}`;
}
function miniAppLabel(
  runtime: TelegramBotRuntimeSummary,
  appType: TelegramBotApplicationType,
) {
  if (appType !== "FINANCE") return "Not applicable";
  if (!runtime.miniApp || runtime.miniApp.status === "UNKNOWN")
    return "Not checked yet";
  return runtime.miniApp.status === "ERROR"
    ? `Error${runtime.miniApp.error ? ` · ${runtime.miniApp.error}` : ""}`
    : `${runtime.miniApp.status === "CONFIGURED" ? "Configured" : "Not configured"}${runtime.miniApp.actualUrl ? ` · ${runtime.miniApp.actualUrl}` : ""}`;
}
function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}
function AppIcon({ type }: { type: TelegramBotApplicationType }) {
  const Icon =
    type === "GREETER" ? Handshake : type === "FINANCE" ? Wallet : Bot;
  const tone =
    type === "FINANCE"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : type === "GREETER"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-sky-500/30 bg-sky-500/10 text-sky-200";
  return (
    <div
      aria-label={`${applicationLabel(type)} bot`}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${tone}`}
    >
      <Icon size={20} aria-hidden="true" />
    </div>
  );
}
function CardAction({
  label,
  tone = "neutral",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${tone === "danger" ? "border-rose-700/70 text-rose-300 hover:bg-rose-950/60" : "border-neutral-700 text-neutral-200 hover:bg-neutral-800"} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
function StatusBadge({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "muted" | "info";
  children: ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : tone === "danger"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
          : tone === "info"
            ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
            : "border-neutral-700 bg-neutral-900 text-neutral-300";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ${cls}`}
    >
      {children}
    </span>
  );
}
function runtimeTone(status: string) {
  return status === "ACTIVE"
    ? "success"
    : status === "ERROR"
      ? "danger"
      : status === "STARTING"
        ? "warning"
        : "muted";
}
function webhookTone(status: string) {
  return status === "CONNECTED"
    ? "success"
    : status === "NOT_CONNECTED"
      ? "danger"
      : "muted";
}
function webhookLabel(runtime: TelegramBotRuntimeSummary) {
  const target = runtime.environment === "LOCAL" ? "LOCAL" : "PROD";
  const connection =
    runtime.webhookConnectionStatus === "CONNECTED"
      ? "CONNECTED"
      : runtime.webhookConnectionStatus === "NOT_CONNECTED"
        ? "NOT CONNECTED"
        : "NOT CONFIGURED";
  return `${target} · ${connection}`;
}
function webhookTooltip(runtime: TelegramBotRuntimeSummary) {
  const target =
    runtime.environment === "LOCAL"
      ? "Local runtime webhook"
      : "Production webhook";
  const connection =
    runtime.webhookConnectionStatus === "CONNECTED"
      ? "is configured for this runtime."
      : runtime.webhookConnectionStatus === "NOT_CONNECTED"
        ? "is not connected in Telegram. Use Check bot after starting the intended runtime."
        : "has not been configured yet.";
  return `${target} ${connection}`;
}
function applicationLabel(type: TelegramBotApplicationType) {
  return type === "GREETER"
    ? "Greeter"
    : type === "FINANCE"
      ? "Finance"
      : "Access";
}
