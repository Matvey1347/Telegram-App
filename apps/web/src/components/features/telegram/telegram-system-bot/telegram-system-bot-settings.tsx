"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, RefreshCw, ShieldCheck, Unlink } from "lucide-react";
import { Button, Card, LoadingState } from "@/components/ui/primitives";
import { telegramSystemBotApi } from "@/lib/api";
import { telegramSystemBotKeys } from "@/lib/query-keys";

export function TelegramSystemBotSettings() {
  const queryClient = useQueryClient();
  const connection = useQuery({
    queryKey: telegramSystemBotKeys.connection(),
    queryFn: telegramSystemBotApi.connection,
  });
  const disconnect = useMutation({
    mutationFn: telegramSystemBotApi.disconnect,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: telegramSystemBotKeys.connection(),
      }),
  });
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Telegram System Bot</h3>
          <p className="mt-1 text-sm text-neutral-400">
            Secure connection for workspace actions and task notifications.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {connection.data && !connection.data.connected ? (
            connection.data.botUsername ? (
              <a
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                href={`https://t.me/${connection.data.botUsername}?start=connect`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} />
                Connect
              </a>
            ) : (
              <Button
                type="button"
                disabled
                title="Telegram System Bot username is not configured"
              >
                Connect
              </Button>
            )
          ) : null}
          {connection.data?.connected ? (
            <span className="rounded-md bg-emerald-950 px-2 py-1 text-xs text-emerald-300">
              Connected
            </span>
          ) : connection.data ? (
            <span className="rounded-md bg-neutral-800 px-2 py-1 text-xs text-neutral-300">
              Not connected
            </span>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="inline-flex items-center gap-2"
            onClick={() => void connection.refetch()}
            disabled={connection.isFetching}
          >
            <RefreshCw size={15} aria-hidden="true" />
            {connection.isFetching ? "Refreshing…" : "Refresh connection"}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 border-y border-neutral-800 py-3 text-xs sm:grid-cols-2">
        {(["PRODUCTION", "LOCAL"] as const).map((environment) => {
          const selected = connection.data?.runtimeEnvironment === environment;
          return (
            <div
              className="flex items-center justify-between gap-2 rounded-md bg-neutral-900/70 px-3 py-2"
              key={environment}
            >
              <span className="font-medium text-neutral-200">
                {environment} System Bot
              </span>
              <span
                className={
                  selected
                    ? "rounded bg-sky-950 px-2 py-0.5 font-medium text-sky-200"
                    : "text-neutral-500"
                }
              >
                {selected ? "Current process" : "Environment-managed"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2 text-xs text-neutral-500">
        <ShieldCheck className="mt-0.5 shrink-0 text-neutral-400" size={15} aria-hidden="true" />
        <p>
          {connection.data?.runtimeEnvironment
            ? `This API process is configured for ${connection.data.runtimeEnvironment}. BotFather tokens and webhook secrets are environment-managed and cannot be viewed or edited here.`
            : "The API process has not selected a System Bot environment. BotFather tokens and webhook secrets are environment-managed and cannot be viewed or edited here."}
        </p>
      </div>
      {connection.isLoading ? <LoadingState /> : null}
      {connection.isError ? (
        <div className="mt-4 text-sm text-rose-300">
          <p>Could not load the Telegram System Bot connection.</p>
          <Button
            className="mt-2"
            variant="secondary"
            onClick={() => void connection.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : null}
      {connection.data?.connected ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-800 pt-4">
          <div className="text-sm text-neutral-300">
            <p>
              {connection.data.username
                ? `@${connection.data.username}`
                : (connection.data.firstName ?? "Telegram account")}
            </p>
            <p className="text-xs text-neutral-500">
              Current workspace:{" "}
              {connection.data.currentWorkspaceName ?? "Not selected"}
            </p>
          </div>
          <div className="flex gap-2">
            {connection.data.botUsername ? (
              <a
                className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800"
                href={`https://t.me/${connection.data.botUsername}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} />
                Open bot
              </a>
            ) : null}
            <Button
              className="inline-flex items-center gap-2 whitespace-nowrap"
              variant="danger"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              <Unlink size={15} />
              Disconnect
            </Button>
          </div>
        </div>
      ) : connection.data ? (
        <div className="mt-4 text-sm text-neutral-500">
          <p>
            Click Connect, then send /start in Telegram to securely link your
            account. Return here and refresh the connection status when you are
            done.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
