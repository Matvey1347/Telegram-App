"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { TelegramChannelSystemBotConnection } from "@telegram-system/shared";
import { Button, Modal } from "@/components/ui/primitives";
import type { TelegramChannel } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import { formatDateTime } from "@/lib/date-format";
import { telegramChannelKeys } from "@/lib/query-keys";

const unverifiedConnection: TelegramChannelSystemBotConnection = {
  connected: false,
  status: "UNVERIFIED",
  botUsername: null,
  lastCheckedAt: null,
  requiredPermission: "POST_MESSAGES",
};

export function ChannelSystemBotBadge({
  connection,
}: {
  connection?: TelegramChannelSystemBotConnection;
}) {
  const status = connection?.status ?? "UNVERIFIED";
  const connected = status === "CONNECTED";
  const unverified = status === "UNVERIFIED";
  const label = connected
    ? "Bot connected"
    : unverified
      ? "Bot not checked"
      : status === "MISSING_POST_PERMISSION"
        ? "No post rights"
        : "Bot not connected";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] font-medium leading-4 ${connected ? "border-emerald-900/90 bg-emerald-950/60 text-emerald-300" : unverified ? "border-amber-900/80 bg-amber-950/40 text-amber-300" : "border-rose-900/80 bg-rose-950/40 text-rose-300"}`}
    >
      {connected ? (
        <ShieldCheck size={11} aria-hidden="true" />
      ) : (
        <ShieldAlert size={11} aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

export function ChannelStatusBadges({
  connection,
  archived,
}: {
  connection?: TelegramChannelSystemBotConnection;
  archived: boolean;
}) {
  return (
    <>
      <ChannelSystemBotBadge connection={connection} />
      {archived ? (
        <span className="inline-flex rounded border border-amber-700/70 bg-amber-950/25 px-2 py-0.5 text-xs text-amber-200">
          Archived
        </span>
      ) : null}
    </>
  );
}

function connectionCopy(connection: TelegramChannelSystemBotConnection) {
  if (connection.connected) {
    return {
      title: "Connection confirmed",
      description:
        "Nexeloq Bot is an administrator and can publish messages in this channel.",
    };
  }
  if (connection.status === "MISSING_POST_PERMISSION") {
    return {
      title: "Post Messages is disabled",
      description:
        "The bot is in the channel, but Telegram has not granted the permission required for publishing.",
    };
  }
  if (connection.status === "NOT_CONFIGURED") {
    return {
      title: "Bot is unavailable",
      description:
        "The workspace System Bot is not configured for this environment.",
    };
  }
  return {
    title: "Connection not confirmed",
    description:
      "Add Nexeloq Bot as a channel administrator, then verify the connection here.",
  };
}

export function ChannelSystemBotAccessModal({
  channel,
  onClose,
}: {
  channel: TelegramChannel;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [verifiedConnection, setVerifiedConnection] =
    useState<TelegramChannelSystemBotConnection | null>(null);
  const connection =
    verifiedConnection ??
    channel.preview?.systemBotConnection ??
    unverifiedConnection;
  const copy = connectionCopy(connection);
  const botUsername = connection.botUsername?.replace(/^@/, "") || null;
  const verify = useMutation({
    mutationFn: () => telegramChannelsApi.checkSystemBotAccess(channel.id),
    onSuccess: async (result) => {
      setVerifiedConnection(result);
      await queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.lists(),
      });
    },
  });

  return (
    <Modal open onClose={onClose} title="Channel bot connection" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-900/80 bg-sky-950/50 text-sky-300">
            <Bot size={21} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white">Nexeloq Bot</p>
            <p className="truncate text-sm text-neutral-400">
              {botUsername ? `@${botUsername}` : "Workspace publishing bot"}
            </p>
          </div>
        </div>

        <div
          aria-live="polite"
          className={`rounded-xl border p-4 ${connection.connected ? "border-emerald-900/80 bg-emerald-950/25" : "border-amber-900/70 bg-amber-950/20"}`}
        >
          <div className="flex items-start gap-3">
            {connection.connected ? (
              <CheckCircle2
                className="mt-0.5 shrink-0 text-emerald-400"
                size={20}
              />
            ) : (
              <ShieldAlert
                className="mt-0.5 shrink-0 text-amber-400"
                size={20}
              />
            )}
            <div>
              <p className="font-medium text-white">{copy.title}</p>
              <p className="mt-1 text-sm leading-5 text-neutral-300">
                {copy.description}
              </p>
              {connection.lastCheckedAt ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Last checked {formatDateTime(connection.lastCheckedAt)}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {!connection.connected && connection.status !== "NOT_CONFIGURED" ? (
          <div className="rounded-xl border border-neutral-800 p-4">
            <p className="font-medium text-white">How to connect</p>
            <ol className="mt-3 space-y-3 text-sm text-neutral-300">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold">
                  1
                </span>
                Open the channel in Telegram and go to Administrators.
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold">
                  2
                </span>
                Add {botUsername ? `@${botUsername}` : "Nexeloq Bot"} as an
                administrator.
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-950 text-xs font-semibold text-blue-300">
                  3
                </span>
                <span>
                  Enable only{" "}
                  <strong className="text-white">Post Messages</strong>. All
                  other administrator permissions may stay disabled.
                </span>
              </li>
            </ol>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-900/70 bg-blue-950/30 px-3 py-2 text-sm text-blue-200">
              <Check size={16} className="shrink-0" aria-hidden="true" />
              Nexeloq never needs permission to add admins or subscribers.
            </div>
          </div>
        ) : null}

        {verify.isError ? (
          <p role="alert" className="text-sm text-rose-300">
            Telegram could not be reached. Please try the check again.
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {botUsername && !connection.connected ? (
            <a
              href={`https://t.me/${encodeURIComponent(botUsername)}?startchannel&admin=post_messages`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-600"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Add in Telegram
            </a>
          ) : null}
          <Button
            type="button"
            onClick={() => verify.mutate()}
            disabled={verify.isPending}
          >
            <RefreshCw
              size={16}
              className={verify.isPending ? "animate-spin" : ""}
              aria-hidden="true"
            />
            {verify.isPending ? "Checking…" : "Check connection"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
