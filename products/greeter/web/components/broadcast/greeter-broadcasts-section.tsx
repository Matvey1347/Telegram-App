"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GreeterBroadcastAudience,
  GreeterBroadcastInput,
  GreeterBroadcastView,
  GreeterChannelView,
  GreeterUserState,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import { greeterApi } from "@/lib/api";
import { greeterKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { GreeterMessageEditor } from "./greeter-message-editor";

const emptyBroadcast: GreeterBroadcastInput = {
  name: "",
  messageText: "",
  buttons: [],
  audience: "ALL_ALIVE",
  channelId: null,
  userState: null,
};

export function GreeterBroadcastsSection({
  botId,
  channels,
}: {
  botId: string;
  channels: GreeterChannelView[];
}) {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [editing, setEditing] = useState<GreeterBroadcastView | "new" | null>(
    null,
  );
  const [action, setAction] = useState<{
    item: GreeterBroadcastView;
    mode: "send" | "schedule" | "cancel";
  } | null>(null);
  const list = useQuery({
    queryKey: greeterKeys.broadcasts(botId),
    queryFn: () => greeterApi.broadcasts(botId),
    refetchInterval: (query) =>
      query.state.data?.some((item) =>
        ["SCHEDULED", "PROCESSING"].includes(item.status),
      )
        ? 5000
        : false,
  });
  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: greeterKeys.broadcasts(botId),
      exact: true,
    });
  const act = useMutation({
    mutationFn: ({
      item,
      mode,
      scheduledAt,
    }: {
      item: GreeterBroadcastView;
      mode: "send" | "schedule" | "cancel";
      scheduledAt?: string;
    }) =>
      mode === "send"
        ? greeterApi.sendBroadcastNow(botId, item.id)
        : mode === "cancel"
          ? greeterApi.cancelBroadcast(botId, item.id)
          : greeterApi.scheduleBroadcast(
              botId,
              item.id,
              new Date(scheduledAt!).toISOString(),
            ),
    onSuccess: () => {
      setAction(null);
      void invalidate();
      pushToast("Broadcast updated.", "success");
    },
    onError: () => pushToast("Failed to update broadcast.", "error"),
  });
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>New broadcast</Button>
      </div>
      <QueryContentState
        isLoading={list.isLoading}
        isError={list.isError}
        isEmpty={!list.data?.length}
        loadingText="Loading broadcasts"
        errorText="Failed to load broadcasts."
        emptyText="No broadcasts yet"
        onRetry={() => void list.refetch()}
      >
        <div className="space-y-3">
          {list.data?.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-white">{item.name}</h3>
                    <span className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-neutral-400">
                    {item.messageText}
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    Audience: {item.audience.replaceAll("_", " ")} ·{" "}
                    {item.progress.sent}/{item.progress.total} sent ·{" "}
                    {item.progress.failed} failed · {item.progress.blocked}{" "}
                    blocked
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === "DRAFT" ? (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => setEditing(item)}
                      >
                        Edit
                      </Button>
                      <Button onClick={() => setAction({ item, mode: "send" })}>
                        Send now
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setAction({ item, mode: "schedule" })}
                      >
                        Schedule
                      </Button>
                    </>
                  ) : null}
                  {["SCHEDULED", "PROCESSING"].includes(item.status) ? (
                    <Button
                      variant="danger"
                      onClick={() => setAction({ item, mode: "cancel" })}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </QueryContentState>
      <BroadcastEditor
        key={`editor:${editing === "new" ? "new" : editing?.id || "closed"}`}
        botId={botId}
        channels={channels}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void invalidate();
        }}
      />
      <BroadcastActionModal
        key={`action:${action ? `${action.item.id}:${action.mode}` : "closed"}`}
        botId={botId}
        action={action}
        saving={act.isPending}
        onClose={() => setAction(null)}
        onConfirm={(scheduledAt) =>
          action && act.mutate({ ...action, scheduledAt })
        }
      />
    </div>
  );
}

function BroadcastEditor({
  botId,
  channels,
  item,
  onClose,
  onSaved,
}: {
  botId: string;
  channels: GreeterChannelView[];
  item: GreeterBroadcastView | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { pushToast } = useAppToast();
  const [draft, setDraft] = useState<GreeterBroadcastInput>(() =>
    item && item !== "new"
      ? {
          name: item.name,
          messageText: item.messageText,
          buttons: item.buttons,
          audience: item.audience,
          channelId: item.channelId,
          userState: item.userState,
        }
      : emptyBroadcast,
  );
  const save = useMutation({
    mutationFn: () =>
      item === "new"
        ? greeterApi.createBroadcast(botId, draft)
        : greeterApi.updateBroadcast(botId, item!.id, draft),
    onSuccess: () => {
      onSaved();
      pushToast("Broadcast draft saved.", "success");
    },
    onError: () => pushToast("Failed to save broadcast draft.", "error"),
  });
  return (
    <Modal
      open={Boolean(item)}
      onClose={onClose}
      title={item === "new" ? "New broadcast" : "Edit broadcast"}
      size="xl"
    >
      <div className="space-y-4">
        <FormField label="Name">
          <Input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </FormField>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Audience">
            <Select
              value={draft.audience}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  audience: e.target.value as GreeterBroadcastAudience,
                  channelId: null,
                  userState: null,
                })
              }
            >
              <option value="ALL_ALIVE">All alive users</option>
              <option value="CHANNEL">Channel</option>
              <option value="USER_STATE">User state</option>
            </Select>
          </FormField>
          {draft.audience === "CHANNEL" ? (
            <FormField label="Channel">
              <Select
                value={draft.channelId || ""}
                onChange={(e) =>
                  setDraft({ ...draft, channelId: e.target.value || null })
                }
              >
                <option value="">Select channel</option>
                {channels.map((channel) => (
                  <option key={channel.channel.id} value={channel.channel.id}>
                    {channel.channel.title}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          {draft.audience === "USER_STATE" ? (
            <FormField label="User state">
              <Select
                value={draft.userState || ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    userState: (e.target.value ||
                      null) as GreeterUserState | null,
                  })
                }
              >
                <option value="">Select state</option>
                <option value="ALIVE">Alive</option>
                <option value="BLOCKED">Blocked</option>
                <option value="DID_NOT_INTERACT">Did not interact</option>
              </Select>
            </FormField>
          ) : null}
        </div>
        <GreeterMessageEditor
          botId={botId}
          text={draft.messageText}
          buttons={draft.buttons}
          onTextChange={(messageText) => setDraft({ ...draft, messageText })}
          onButtonsChange={(buttons) => setDraft({ ...draft, buttons })}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={
              !draft.name.trim() || !draft.messageText.trim() || save.isPending
            }
          >
            Save draft
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BroadcastActionModal({
  botId,
  action,
  saving,
  onClose,
  onConfirm,
}: {
  botId: string;
  action: {
    item: GreeterBroadcastView;
    mode: "send" | "schedule" | "cancel";
  } | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (scheduledAt?: string) => void;
}) {
  const [scheduledAt, setScheduledAt] = useState("");
  const estimate = useQuery({
    queryKey: action
      ? greeterKeys.broadcastEstimate(botId, action.item.id)
      : ["greeter", "estimate", "closed"],
    queryFn: () => greeterApi.estimateBroadcast(botId, action!.item.id),
    enabled: Boolean(action && action.mode !== "cancel"),
  });
  return (
    <Modal
      open={Boolean(action)}
      onClose={onClose}
      title={
        action?.mode === "cancel"
          ? "Cancel broadcast"
          : action?.mode === "schedule"
            ? "Schedule broadcast"
            : "Confirm broadcast"
      }
    >
      {action ? (
        <div className="space-y-4">
          <p className="text-sm text-neutral-300">
            {action.mode === "cancel"
              ? "Stop pending delivery? Messages already sent cannot be recalled."
              : `This will message ${estimate.data?.recipients ?? "…"} recipients. Delivery cannot be undone.`}
          </p>
          {estimate.isError ? (
            <p className="text-sm text-rose-300">
              Could not estimate recipients. Close and try again.
            </p>
          ) : null}
          {action.mode === "schedule" ? (
            <FormField label="Send at">
              <Input
                type="datetime-local"
                min={new Date().toISOString().slice(0, 16)}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </FormField>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Back
            </Button>
            <Button
              variant={action.mode === "cancel" ? "danger" : "primary"}
              disabled={
                saving ||
                (action.mode !== "cancel" &&
                  (!estimate.data ||
                    (action.mode === "schedule" && !scheduledAt)))
              }
              onClick={() => onConfirm(scheduledAt || undefined)}
            >
              {action.mode === "cancel"
                ? "Confirm cancel"
                : action.mode === "schedule"
                  ? "Confirm schedule"
                  : "Confirm send"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
