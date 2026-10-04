"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  GreeterChannelView,
  GreeterSequenceStepInput,
  GreeterSequenceTrigger,
} from "@telegram-system/shared";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  Modal,
  ToggleRow,
} from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import { greeterApi } from "@/lib/api";
import { greeterKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import {
  GreeterDelayInput,
  preferredDelayUnit,
  type DelayUnit,
} from "./greeter-delay-input";
import { GreeterMessageEditor } from "./greeter-message-editor";
import { CreateGreeterAutomationModal } from "./greeter-create-automation-modal";

export function GreeterAutomationsSection({
  botId,
  channels,
}: {
  botId: string;
  channels: GreeterChannelView[];
}) {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const list = useQuery({
    queryKey: greeterKeys.sequences(botId),
    queryFn: () => greeterApi.sequences(botId),
  });
  const create = useMutation({
    mutationFn: (input: {
      name: string;
      trigger: GreeterSequenceTrigger;
      channelId?: string | null;
    }) =>
      greeterApi.createSequence(botId, input),
    onSuccess: (data) => {
      setCreateOpen(false);
      setSelectedId(data.id);
      void qc.invalidateQueries({
        queryKey: greeterKeys.sequences(botId),
        exact: true,
      });
      pushToast("Automation created.", "success");
    },
    onError: () => pushToast("Failed to create automation.", "error"),
  });
  return (
    <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-white">Automations</h2>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} />
          </Button>
        </div>
        <QueryContentState
          isLoading={list.isLoading}
          isError={list.isError}
          isEmpty={!list.data?.length}
          loadingText="Loading automations"
          errorText="Failed to load automations."
          emptyText="No automations yet"
          onRetry={() => void list.refetch()}
        >
          <div className="space-y-2">
            {list.data?.map((sequence) => (
              <button
                key={sequence.id}
                type="button"
                onClick={() => setSelectedId(sequence.id)}
                className={`w-full rounded-lg border p-3 text-left ${selectedId === sequence.id ? "border-blue-500 bg-blue-500/10" : "border-neutral-800 bg-neutral-950"}`}
              >
                <p className="font-medium text-white">{sequence.name}</p>
                <p className="mt-1 text-xs text-neutral-400">
                  {sequence.trigger.replaceAll("_", " ")} ·{" "}
                  {sequence.scope.type === "CHANNEL"
                    ? sequence.scope.channel?.title || "Channel"
                    : "Global"}{" "}
                  ·{" "}
                  {sequence.draftStepCount} steps ·{" "}
                  {sequence.enabled ? "enabled" : "disabled"}
                </p>
              </button>
            ))}
          </div>
        </QueryContentState>
      </Card>
      <div>
        {selectedId ? (
          <AutomationEditor
            key={selectedId}
            botId={botId}
            sequenceId={selectedId}
          />
        ) : (
          <Card>
            <p className="text-sm text-neutral-400">
              Select an automation to edit its draft.
            </p>
          </Card>
        )}
      </div>
      <CreateGreeterAutomationModal
        open={createOpen}
        saving={create.isPending}
        channels={channels}
        onClose={() => setCreateOpen(false)}
        onCreate={(name, trigger, channelId) =>
          create.mutate({ name, trigger, channelId })
        }
      />
    </div>
  );
}

function AutomationEditor({
  botId,
  sequenceId,
}: {
  botId: string;
  sequenceId: string;
}) {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [draftOverride, setDraft] = useState<GreeterSequenceStepInput[] | null>(
    null,
  );
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [delayUnits, setDelayUnits] = useState<Record<number, DelayUnit>>({});
  const detail = useQuery({
    queryKey: greeterKeys.sequence(botId, sequenceId),
    queryFn: () => greeterApi.sequence(botId, sequenceId),
  });
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({
        queryKey: greeterKeys.sequence(botId, sequenceId),
      }),
      qc.invalidateQueries({
        queryKey: greeterKeys.sequences(botId),
        exact: true,
      }),
    ]);
  const save = useMutation({
    mutationFn: () =>
      greeterApi.saveDraft(
        botId,
        sequenceId,
        detail.data!.draftRevision,
        draft.map((step, index) => ({ ...step, position: index })),
      ),
    onSuccess: () => {
      void invalidate();
      pushToast("Draft saved.", "success");
    },
    onError: () =>
      pushToast("Failed to save draft. Reload and try again.", "error"),
  });
  const publish = useMutation({
    mutationFn: () =>
      greeterApi.publishSequence(botId, sequenceId, detail.data!.draftRevision),
    onSuccess: () => {
      setConfirmPublish(false);
      void invalidate();
      pushToast("Automation published.", "success");
    },
    onError: () => pushToast("Failed to publish automation.", "error"),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      greeterApi.updateSequence(botId, sequenceId, { enabled }),
    onSuccess: () => void invalidate(),
    onError: () => pushToast("Failed to update automation.", "error"),
  });
  if (detail.isLoading)
    return (
      <Card>
        <p className="text-sm text-neutral-400">Loading automation…</p>
      </Card>
    );
  if (detail.isError || !detail.data)
    return (
      <Card>
        <p className="text-sm text-rose-300">Failed to load this automation.</p>
      </Card>
    );
  const draft =
    draftOverride ??
    detail.data.draftSteps.map(
      ({ position, delaySeconds, enabled, messageText, buttons }) => ({
        position,
        delaySeconds,
        enabled,
        messageText,
        buttons,
      }),
    );
  const updateStep = (index: number, next: Partial<GreeterSequenceStepInput>) =>
    setDraft(
      draft.map((step, itemIndex) =>
        itemIndex === index ? { ...step, ...next } : step,
      ),
    );
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">
              {detail.data.name}
            </h2>
            <p className="text-sm text-neutral-400">
              Draft revision {detail.data.draftRevision} · Published{" "}
              {detail.data.currentVersion
                ? `v${detail.data.currentVersion.version}`
                : "never"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => toggle.mutate(!detail.data.enabled)}
            >
              {detail.data.enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              onClick={() => setConfirmPublish(true)}
              disabled={!draft.length}
            >
              Publish
            </Button>
          </div>
        </div>
      </Card>
      {draft.map((step, index) => (
        <Card key={index}>
          <div className="mb-4 flex items-end gap-3">
            <GreeterDelayInput
              index={index}
              delaySeconds={step.delaySeconds}
              unit={delayUnits[index] ?? preferredDelayUnit(step.delaySeconds)}
              onUnitChange={(unit) =>
                setDelayUnits((current) => ({ ...current, [index]: unit }))
              }
              onChange={(delaySeconds) => updateStep(index, { delaySeconds })}
            />
            <div className="pb-0.5">
              <Button
                variant="danger"
                onClick={() =>
                  setDraft(draft.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Trash2 size={16} />
              </Button>
            </div>
          </div>
          <ToggleRow
            checked={step.enabled}
            onChange={(enabled) => updateStep(index, { enabled })}
            label="Step enabled"
            className="mb-4"
          />
          <GreeterMessageEditor
            botId={botId}
            text={step.messageText}
            buttons={step.buttons}
            onTextChange={(messageText) => updateStep(index, { messageText })}
            onButtonsChange={(buttons) => updateStep(index, { buttons })}
          />
        </Card>
      ))}
      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={() =>
            setDraft([
              ...draft,
              {
                position: draft.length,
                delaySeconds: 0,
                enabled: true,
                messageText: "",
                buttons: [],
              },
            ])
          }
        >
          <Plus size={16} /> Add step
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving" : "Save draft"}
        </Button>
      </div>
      <Modal
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title="Publish automation"
      >
        <p className="text-sm text-neutral-300">
          Publish this draft as an immutable production version?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmPublish(false)}>
            Cancel
          </Button>
          <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
            Confirm publish
          </Button>
        </div>
      </Modal>
    </div>
  );
}
