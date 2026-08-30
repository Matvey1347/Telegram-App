"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  Laptop,
  RefreshCw,
  Server,
  ShieldCheck,
  Unlink,
} from "lucide-react";
import { Button, Card, Skeleton } from "@/components/ui/primitives";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { telegramSystemBotApi } from "@/lib/api";
import { telegramSystemBotKeys } from "@/lib/query-keys";

const ENVIRONMENTS = [
  {
    id: "PRODUCTION" as const,
    icon: Server,
  },
  {
    id: "LOCAL" as const,
    icon: Laptop,
  },
];

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
  const data = connection.data;
  const botUsername = data?.botUsername?.replace(/^@/, "") ?? null;
  const botAvatarUrl = botUsername
    ? `https://t.me/i/userpic/320/${encodeURIComponent(botUsername)}.jpg`
    : null;

  return (
    <Card className="overflow-visible p-0">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sky-900/80 bg-sky-950/50 text-sky-300">
            {botAvatarUrl ? (
              <img
                src={botAvatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <ShieldCheck size={18} aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-neutral-100">
                Nexeloq Bot
              </h2>
              {data ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${data.runtimeEnvironment ? "border-emerald-900 bg-emerald-950/70 text-emerald-300" : "border-neutral-700 bg-neutral-900 text-neutral-400"}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${data.runtimeEnvironment ? "bg-emerald-400" : "bg-neutral-500"}`}
                    aria-hidden="true"
                  />
                  {data.runtimeEnvironment ? "Bot active" : "Bot unavailable"}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-neutral-400">
              {botUsername ? `@${botUsername} · ` : ""}Commands and
              notifications. Publishing uses the bot permissions in each
              channel.
            </p>
          </div>
        </div>
        <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
          {data && !data.connected ? (
            data.botUsername ? (
              <a
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
                href={`https://t.me/${data.botUsername}?start=connect`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} aria-hidden="true" />
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
          <ActionMenu label="Telegram System Bot actions">
            <ActionMenuItem
              icon={
                <RefreshCw
                  size={15}
                  className={connection.isFetching ? "animate-spin" : ""}
                />
              }
              onClick={() => void connection.refetch()}
              disabled={connection.isFetching}
            >
              {connection.isFetching ? "Refreshing…" : "Refresh connection"}
            </ActionMenuItem>
            {data?.connected && data.botUsername ? (
              <ActionMenuItem
                icon={<ExternalLink size={15} />}
                onClick={() =>
                  window.open(
                    `https://t.me/${data.botUsername}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Open bot
              </ActionMenuItem>
            ) : null}
            {data?.connected ? (
              <ActionMenuItem
                danger
                icon={<Unlink size={15} />}
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                Disconnect
              </ActionMenuItem>
            ) : null}
          </ActionMenu>
        </div>
      </div>

      <div className="rounded-b-lg border-t border-neutral-800 bg-neutral-950/45 p-3.5 sm:p-4">
        {connection.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : null}
        {connection.isError ? (
          <div className="flex flex-col gap-3 rounded-lg border border-rose-900/70 bg-rose-950/25 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <AlertTriangle
                className="mt-0.5 shrink-0 text-rose-300"
                size={18}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-rose-200">
                  Connection status is unavailable
                </p>
                <p className="mt-1 text-xs leading-5 text-rose-200/70">
                  The API could not load the Telegram System Bot connection.
                  Check the API process and try again.
                </p>
              </div>
            </div>
            <Button
              className="shrink-0 justify-center"
              variant="secondary"
              onClick={() => void connection.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : null}

        {data ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {ENVIRONMENTS.map((environment) => {
                const selected = data.runtimeEnvironment === environment.id;
                const Icon = environment.icon;
                return (
                  <div
                    className={`flex items-center gap-2.5 rounded-lg border p-2.5 ${selected ? "border-sky-800 bg-sky-950/25" : "border-neutral-800 bg-neutral-900/55"}`}
                    key={environment.id}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${selected ? "bg-sky-900/60 text-sky-200" : "bg-neutral-800 text-neutral-400"}`}
                    >
                      <Icon size={17} aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-neutral-200">
                          {environment.id === "LOCAL"
                            ? "Local development"
                            : "Production"}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 text-xs ${selected ? "text-sky-300" : "text-neutral-500"}`}
                        >
                          {selected ? (
                            <Check size={13} aria-hidden="true" />
                          ) : null}
                          {selected ? "Current process" : "Environment-managed"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-neutral-500">
              <ShieldCheck
                className="mt-0.5 shrink-0 text-neutral-400"
                size={15}
                aria-hidden="true"
              />
              <p>
                {data.runtimeEnvironment
                  ? `${data.runtimeEnvironment} is active for this API process. Credentials are managed through the environment.`
                  : "No System Bot environment is selected. Credentials are managed through the environment."}
              </p>
            </div>

            {!data.connected ? (
              <p className="mt-3 border-t border-neutral-800 pt-3 text-sm leading-5 text-neutral-400">
                Open the bot, send{" "}
                <span className="font-medium text-neutral-200">/start</span>,
                then return here and refresh. This personal connection is only
                needed for commands and notifications.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </Card>
  );
}
