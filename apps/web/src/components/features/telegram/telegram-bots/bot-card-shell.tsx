"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  CircleX,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Settings,
  UserRoundPen,
  Trash2,
} from "lucide-react";
import type {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
  TelegramBotRuntimeSummary,
} from "@telegram-system/shared";
import type { TelegramBot } from "@/lib/api";
import { Button, Tooltip } from "@/components/ui/primitives";
import { runtimeAppPresentation } from "./runtime-app-presentation";
import { BotRuntimeAvatar } from "./bot-runtime-avatar";

export function BotCardShell({
  bot,
  checkingEnvironment,
  onCheck,
  onRequestDelete,
  onSwitch,
  onConfigureRuntime,
  onEditProfile,
  children,
}: {
  bot: TelegramBot;
  checkingEnvironment: TelegramBotRuntimeEnvironment | null;
  onCheck: (environment: TelegramBotRuntimeEnvironment) => void;
  onRequestDelete: (environment: TelegramBotRuntimeEnvironment) => void;
  onSwitch: () => void;
  onConfigureRuntime: (environment: TelegramBotRuntimeEnvironment) => void;
  onEditProfile?: (environment: TelegramBotRuntimeEnvironment) => void;
  children:
    | ReactNode
    | ((environment: TelegramBotRuntimeEnvironment) => ReactNode);
}) {
  const storageKey = `telegram-bot-runtime-environment:${bot.id}`;
  const [environment, setEnvironment] =
    useState<TelegramBotRuntimeEnvironment>("PRODUCTION");

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "LOCAL" || saved === "PRODUCTION") setEnvironment(saved);
  }, [storageKey]);

  function selectEnvironment(next: TelegramBotRuntimeEnvironment) {
    setEnvironment(next);
    window.localStorage.setItem(storageKey, next);
  }
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
          <BotRuntimeAvatar type={appType} avatarUrl={runtime?.avatarUrl} />
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
          <CardAction
            label="Edit Telegram name and profile photo"
            disabled={!runtime}
            onClick={() => onEditProfile?.(environment)}
          >
            <UserRoundPen size={16} />
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
          <CardAction
            label="Delete runtime or bot"
            tone="danger"
            onClick={() => onRequestDelete(environment)}
          >
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
            onClick={() => selectEnvironment(option)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${environment === option ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
          >
            {option === "PRODUCTION" ? "Production" : "Local"}
          </button>
        ))}
      </div>
      {runtime ? (
        <RuntimeDetails runtime={runtime} appType={appType} botId={bot.id} />
      ) : (
        <RuntimeSetupState
          environment={environment}
          onConfigure={() => onConfigureRuntime(environment)}
        />
      )}
      {runtime ? (
        <div className="mt-3 border-t border-neutral-800 pt-3">
          {typeof children === "function" ? children(environment) : children}
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
  botId,
}: {
  runtime: TelegramBotRuntimeSummary;
  appType: TelegramBotApplicationType;
  botId: string;
}) {
  const statusLabel = runtimeStatusLabel(runtime);
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Tooltip content={runtimeStatusTooltip(runtime)}>
          <StatusBadge tone={runtimeStatusTone(runtime)}>
            {statusLabel === "RUNNING" ? (
              <CheckCircle2 size={13} />
            ) : statusLabel === "STARTING" ? (
              <LoaderCircle className="animate-spin" size={13} />
            ) : (
              <CircleX size={13} />
            )}
            {statusLabel}
          </StatusBadge>
        </Tooltip>
        <StatusBadge tone={appType === "NONE" ? "muted" : "info"}>
          {runtimeAppPresentation(appType).emoji} {applicationLabel(appType)}
        </StatusBadge>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
        <RuntimeField
          label="Finance App"
          value={
            <RuntimeAppLink
              runtime={runtime}
              url={financeAppUrl(runtime, appType, botId)}
            />
          }
        />
      </dl>
      {!runtime.isProcessOwner ? (
        <p className="mt-3 rounded-lg border border-neutral-700 bg-neutral-900/60 p-2.5 text-sm text-neutral-300">
          {runtime.environment === "LOCAL" ? "Local" : "Production"} runtime is
          not running in this API process. Its saved webhook is not treated as
          live.
        </p>
      ) : null}
      {runtime.isProcessOwner &&
      runtime.environment === "PRODUCTION" &&
      runtime.runtimeStatus !== "ACTIVE" ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-100">
          Production token is saved. Deploy the production API with its public
          webhook URL to activate this runtime.
        </p>
      ) : null}
      {runtime.isProcessOwner &&
      runtime.environment === "LOCAL" &&
      runtime.runtimeStatus !== "ACTIVE" ? (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-100">
          Local token is saved. Run{" "}
          <code className="rounded bg-amber-950/40 px-1">pnpm dev:bots</code> on
          this computer to start the local API, web app and ngrok; the reachable
          webhook is then registered automatically.
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
function RuntimeField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-neutral-200">{value}</dd>
    </div>
  );
}
function RuntimeAppLink({
  runtime,
  url,
}: {
  runtime: TelegramBotRuntimeSummary;
  url: string | null;
}) {
  const running = runtime.isProcessOwner && runtime.runtimeStatus === "ACTIVE";
  if (!running || !url) return <>NOT RUNNING</>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="break-all text-sky-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      RUNNING
    </a>
  );
}
function financeAppUrl(
  runtime: TelegramBotRuntimeSummary,
  appType: TelegramBotApplicationType,
  botId: string,
) {
  if (appType !== "FINANCE") return null;
  const knownUrl =
    runtime.miniApp.actualUrl ||
    runtime.miniApp.expectedUrl ||
    runtime.webApp.url;
  if (knownUrl) return knownUrl;
  // `dev:bots` has one public gateway: its webhook base and Mini App base are
  // deliberately the same. This exposes a usable local link before a manual
  // runtime check has persisted BotFather/menu-button state.
  if (runtime.environment !== "LOCAL" || !runtime.webhookUrl) return null;
  const marker = "/api/telegram/bots/runtime/";
  const index = runtime.webhookUrl.indexOf(marker);
  if (index < 0) return null;
  return `${runtime.webhookUrl.slice(0, index)}/finance/${encodeURIComponent(botId)}`;
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
function runtimeStatusLabel(runtime: TelegramBotRuntimeSummary) {
  if (runtime.isProcessOwner && runtime.runtimeStatus === "STARTING") {
    return "STARTING";
  }
  if (runtime.isProcessOwner && runtime.runtimeStatus === "ERROR") {
    return "ERROR";
  }
  return webhookIsRunning(runtime) ? "RUNNING" : "STOPPED";
}
function runtimeStatusTone(runtime: TelegramBotRuntimeSummary) {
  const label = runtimeStatusLabel(runtime);
  return label === "RUNNING"
    ? "success"
    : label === "STARTING"
      ? "warning"
      : "danger";
}
function webhookIsRunning(runtime: TelegramBotRuntimeSummary) {
  return (
    runtime.isProcessOwner &&
    runtime.runtimeStatus === "ACTIVE" &&
    runtime.webhookConnectionStatus === "CONNECTED"
  );
}
function runtimeStatusTooltip(runtime: TelegramBotRuntimeSummary) {
  const label = runtimeStatusLabel(runtime);
  if (label === "RUNNING") {
    return "Runtime is active and its webhook is connected.";
  }
  if (label === "STARTING") return "Runtime is starting.";
  if (label === "ERROR") return "Runtime stopped because of an error.";
  return "Runtime or its webhook is stopped.";
}
function applicationLabel(type: TelegramBotApplicationType) {
  return type === "GREETER"
    ? "Greeter"
    : type === "FINANCE"
      ? "Finance"
      : "Access";
}
