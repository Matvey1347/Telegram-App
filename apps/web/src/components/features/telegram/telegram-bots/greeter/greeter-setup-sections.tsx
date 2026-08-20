"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GreeterChannelView,
  GreeterOverview,
} from "@telegram-system/shared";
import { Activity, RefreshCw, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  CustomSelect,
} from "@/components/ui/primitives";
import { greeterApi, telegramBotsApi } from "@/lib/api";
import { greeterKeys, telegramAccountKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { GreeterChannelOverrideControl } from "./greeter-channel-override-modal";

export function GreeterOverviewSection({
  overview,
}: {
  overview: GreeterOverview;
}) {
  const values = [
    ["Acquired", overview.metrics.acquired],
    ["Alive", overview.metrics.alive],
    ["Blocked", overview.metrics.blocked],
    ["No interaction", overview.metrics.didNotInteract],
    ["Approved", overview.metrics.approved],
  ] as const;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {values.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase text-neutral-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {value.toLocaleString()}
            </p>
          </Card>
        ))}
      </div>
      <Card>
        <div className="flex items-center gap-2 text-white">
          <Activity size={18} />
          <h2 className="font-semibold">Runtime health</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Status label="Runtime" value={overview.bot.runtimeStatus} />
          <Status label="Webhook" value={overview.bot.webhookStatus} />
          <Status
            label="Connected channels"
            value={String(overview.channels.length)}
          />
        </div>
        {overview.bot.lastRuntimeError ? (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
            {overview.bot.lastRuntimeError}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

export function GreeterChannelsSection({
  botId,
  channels,
}: {
  botId: string;
  channels: GreeterChannelView[];
}) {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [candidate, setCandidate] = useState("");
  const [removing, setRemoving] = useState<GreeterChannelView | null>(null);
  const access = useQuery({
    queryKey: telegramAccountKeys.botChannels(botId),
    queryFn: () => telegramBotsApi.channels(botId),
  });
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: greeterKeys.overview(botId) });
  const connect = useMutation({
    mutationFn: () => greeterApi.connectChannel(botId, candidate),
    onSuccess: () => {
      setCandidate("");
      void invalidate();
      pushToast("Channel connected.", "success");
    },
    onError: () => pushToast("Failed to connect channel.", "error"),
  });
  const update = useMutation({
    mutationFn: ({
      channelId,
      enabled,
      useGlobalConfig,
    }: {
      channelId: string;
      enabled: boolean;
      useGlobalConfig: boolean;
    }) =>
      greeterApi.updateChannel(botId, channelId, { enabled, useGlobalConfig }),
    onSuccess: () => void invalidate(),
    onError: () => pushToast("Failed to update channel.", "error"),
  });
  const refresh = useMutation({
    mutationFn: (channelId: string) =>
      greeterApi.refreshPermissions(botId, channelId),
    onSuccess: () => void invalidate(),
    onError: () => pushToast("Failed to refresh permissions.", "error"),
  });
  const remove = useMutation({
    mutationFn: (channelId: string) =>
      greeterApi.disconnectChannel(botId, channelId),
    onSuccess: () => {
      setRemoving(null);
      void invalidate();
      pushToast("Channel disconnected.", "success");
    },
    onError: () => pushToast("Failed to disconnect channel.", "error"),
  });
  const connected = new Set(channels.map((item) => item.channel.id));
  const options = (access.data || [])
    .filter((item) => !connected.has(item.channelId))
    .map((item) => ({ value: item.channelId, label: item.title }));
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold text-white">Connect a channel</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <CustomSelect
            value={candidate}
            onChange={setCandidate}
            options={options}
            placeholder={
              access.isLoading ? "Loading channels…" : "Select channel"
            }
          />
          <Button
            onClick={() => connect.mutate()}
            disabled={!candidate || connect.isPending}
          >
            Connect
          </Button>
        </div>
        {access.isError ? (
          <p className="mt-2 text-sm text-rose-300">
            Could not load bot channel access.
          </p>
        ) : null}
      </Card>
      {channels.length ? (
        <div className="space-y-3">
          {channels.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-medium text-white">
                    {item.channel.title}
                  </h3>
                  <p className="text-sm text-neutral-400">
                    {item.channel.username
                      ? `@${item.channel.username}`
                      : "Private channel"}{" "}
                    · {item.permissionHealth.status.replaceAll("_", " ")}
                  </p>
                  {item.permissionHealth.missingPermissions.length ? (
                    <p className="mt-1 text-sm text-amber-300">
                      Missing:{" "}
                      {item.permissionHealth.missingPermissions.join(", ")}
                    </p>
                  ) : null}
                  {item.permissionHealth.error ? (
                    <p className="mt-1 text-sm text-rose-300">
                      {item.permissionHealth.error} Refresh permissions after
                      restoring the bot admin role.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      update.mutate({
                        channelId: item.id,
                        enabled: !item.enabled,
                        useGlobalConfig: item.useGlobalConfig,
                      })
                    }
                  >
                    {item.enabled ? "Disable" : "Enable"}
                  </Button>
                  <GreeterChannelOverrideControl
                    botId={botId}
                    channel={item}
                    onSaved={() => void invalidate()}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => refresh.mutate(item.id)}
                  >
                    <RefreshCw size={16} />
                  </Button>
                  <Button variant="danger" onClick={() => setRemoving(item)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-neutral-400">
            No Greeter channels connected.
          </p>
        </Card>
      )}
      <ConfirmDeleteModal
        open={Boolean(removing)}
        entityName={removing?.channel.title || ""}
        description="Greeter will stop handling join requests for this channel."
        onClose={() => setRemoving(null)}
        onConfirm={() =>
          removing ? remove.mutateAsync(removing.id) : undefined
        }
        label="Disconnect"
      />
    </div>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-neutral-100">
        {value.replaceAll("_", " ")}
      </p>
    </div>
  );
}
