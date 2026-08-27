"use client";

import { formatDateTime } from "@/lib/date-format";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GreeterChannelView,
  GreeterTesterLookup,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  CustomSelect,
  FormField,
  Input,
  Modal,
} from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import { greeterApi } from "@/lib/api";
import { greeterKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

function apiMessage(error: unknown, fallback: string) {
  return (
    error as { response?: { data?: { message?: string } } }
  ).response?.data?.message || fallback;
}

function normalizedUsername(value: string) {
  return value.trim().replace(/^@/, "");
}

export function GreeterTestModeSection({
  botId,
  channels,
}: {
  botId: string;
  channels: GreeterChannelView[];
}) {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [username, setUsername] = useState("");
  const [resolved, setResolved] = useState<GreeterTesterLookup | null>(null);
  const [channelId, setChannelId] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const status = useQuery({
    queryKey: greeterKeys.testMode(botId),
    queryFn: () => greeterApi.testMode(botId),
  });
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: greeterKeys.testMode(botId) });
  const resolve = useMutation({
    mutationFn: () =>
      greeterApi.resolveTestUser(botId, {
        username: normalizedUsername(username),
      }),
    onSuccess: (tester) => {
      setResolved(tester);
      setResolveError(null);
    },
    onError: (error) => {
      setResolved(null);
      setResolveError(
        apiMessage(error, "This user is not known to the connected bot."),
      );
    },
  });
  const enable = useMutation({
    mutationFn: () =>
      greeterApi.enableTestMode(botId, {
        telegramBotUserId: resolved!.id,
        channelId: channelId || null,
      }),
    onSuccess: () => {
      void invalidate();
      pushToast("Test mode enabled.", "success");
    },
    onError: (error) =>
      pushToast(apiMessage(error, "Failed to enable test mode."), "error"),
  });
  const reset = useMutation({
    mutationFn: () => greeterApi.resetTestMode(botId),
    onSuccess: () => {
      setConfirmReset(false);
      void invalidate();
      pushToast("Test user reset without changing production history.", "success");
    },
    onError: (error) =>
      pushToast(apiMessage(error, "Failed to reset the test user."), "error"),
  });
  const disable = useMutation({
    mutationFn: () => greeterApi.disableTestMode(botId),
    onSuccess: () => {
      void invalidate();
      pushToast("Test mode disabled.", "success");
    },
    onError: (error) =>
      pushToast(apiMessage(error, "Failed to disable test mode."), "error"),
  });
  const session = status.data;
  const active = Boolean(session?.enabled && session.tester);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold text-white">Test mode on the real bot</h2>
        <p className="mt-2 text-sm text-neutral-400">
          The selected user writes to this connected bot as usual. Their new
          updates use draft GREETER configuration while everyone else remains
          on production.
        </p>
      </Card>
      <QueryContentState
        isLoading={status.isLoading}
        isError={status.isError}
        isEmpty={status.data === undefined && !status.isSuccess}
        loadingText="Loading test mode"
        errorText="Failed to load test mode."
        emptyText="Test mode is unavailable"
        onRetry={() => void status.refetch()}
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <h3 className="font-semibold text-white">Status</h3>
            <dl className="mt-3 grid gap-2 text-sm">
              <Status label="State" value={active ? "Enabled" : "Disabled"} />
              <Status
                label="Test user"
                value={
                  session?.tester
                    ? `${session.tester.displayName}${session.tester.username ? ` (@${session.tester.username})` : ""}`
                    : "Not selected"
                }
              />
              <Status
                label="Channel context"
                value={session?.channel?.title || "Automatic / global"}
              />
              <Status
                label="Generation"
                value={session ? String(session.generation) : "—"}
              />
              <Status
                label="Last interaction"
                value={
                  session?.lastInteractionAt
                    ? formatDateTime(session.lastInteractionAt)
                    : "—"
                }
              />
            </dl>
            {active ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  onClick={() => setConfirmReset(true)}
                  disabled={reset.isPending}
                >
                  Reset test user
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => disable.mutate()}
                  disabled={disable.isPending}
                >
                  {disable.isPending ? "Disabling" : "Disable test mode"}
                </Button>
              </div>
            ) : null}
          </Card>
          <Card>
            <h3 className="font-semibold text-white">Select test user</h3>
            <div className="mt-4 space-y-4">
              <FormField label="Telegram username">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={username}
                    onChange={(event) => {
                      setUsername(event.target.value);
                      setResolved(null);
                      setResolveError(null);
                    }}
                    placeholder="@username"
                  />
                  <Button
                    variant="secondary"
                    onClick={() => resolve.mutate()}
                    disabled={!normalizedUsername(username) || resolve.isPending}
                  >
                    {resolve.isPending ? "Finding" : "Find user"}
                  </Button>
                </div>
              </FormField>
              {resolveError ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                  <p>{resolveError}</p>
                  <p className="mt-1 text-amber-100/80">
                    Ask the user to open this bot and send /start once, then try
                    the exact username again. Telegram cannot resolve users who
                    never interacted with the bot.
                  </p>
                </div>
              ) : null}
              {resolved ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                  Found: {resolved.displayName}
                  {resolved.username ? ` (@${resolved.username})` : ""}
                </div>
              ) : null}
              <FormField label="Channel context (optional)">
                <CustomSelect
                  value={channelId}
                  onChange={setChannelId}
                  options={[
                    { value: "", label: "Automatic / global" },
                    ...channels.map((item) => ({
                      value: item.channel.id,
                      label: item.channel.title,
                    })),
                  ]}
                  searchable={false}
                />
              </FormField>
              <Button
                onClick={() => enable.mutate()}
                disabled={!resolved || enable.isPending}
              >
                {enable.isPending ? "Enabling" : "Enable test mode"}
              </Button>
            </div>
          </Card>
        </div>
      </QueryContentState>
      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset test user"
      >
        <p className="text-sm text-neutral-300">
          Clear only TEST lifecycle, captcha, automation progress and test
          deliveries? Production analytics, payments and history remain intact.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
          >
            Confirm reset
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-neutral-800 pb-2 last:border-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right text-neutral-200">{value}</dd>
    </div>
  );
}
