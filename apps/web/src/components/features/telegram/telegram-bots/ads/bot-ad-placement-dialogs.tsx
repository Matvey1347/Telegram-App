"use client";

import { useState } from "react";
import type {
  BotAdChannelOption,
  BotAdLinkView,
} from "@telegram-system/shared";
import type { BotAdPlacementInput } from "@/lib/features/telegram/bot-ads-api";
import {
  Button,
  CustomSelect,
  DateInput,
  FormError,
  FormField,
  Input,
  Modal,
  TimeInput,
  localDateTimeInputToIso,
} from "@/components/ui/primitives";

export type BotAdPlacementSeed = {
  title?: string;
  channelId?: string;
  promo?: { id: string; title: string };
};

export function BotAdLinkDialog({
  seed,
  channels,
  loading,
  channelsError,
  pending,
  error,
  onSave,
  onClose,
}: {
  seed: BotAdPlacementSeed;
  channels: BotAdChannelOption[];
  loading: boolean;
  channelsError: boolean;
  pending: boolean;
  error?: string;
  onSave: (input: BotAdPlacementInput) => void;
  onClose: () => void;
}) {
  const [id] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(seed.title ?? "");
  const [channelId, setChannelId] = useState(seed.channelId ?? "");
  const channelAvailable = channels.some((channel) => channel.id === channelId);
  const disabled =
    pending || !title.trim() || (Boolean(channelId) && !channelAvailable);
  return (
    <Modal
      open
      title="Create invite link"
      onClose={pending ? () => {} : onClose}
      size="sm"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled)
            onSave({
              id,
              title,
              channelId: channelId || undefined,
            });
        }}
      >
        <FormField label="Name" required>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            required
          />
        </FormField>
        <FormField label="Channel">
          <CustomSelect
            value={channelId}
            onChange={setChannelId}
            placeholder={
              loading ? "Loading channels…" : "Select a workspace channel"
            }
            options={[
              { value: "", label: "No channel" },
              ...channels.map((channel) => ({
                value: channel.id,
                label: channel.title,
                iconPresentation: channel.avatarPresentation ?? undefined,
              })),
            ]}
            disabled={loading || channelsError || pending}
          />
        </FormField>
        {channelsError ? (
          <FormError message="Could not load workspace channels." />
        ) : null}
        {error ? <FormError message={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={disabled}>
            {pending ? "Creating…" : "Create link"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function BotAdPublishDialog({
  link,
  pending,
  error,
  onPublish,
  onClose,
}: {
  link: BotAdLinkView;
  pending: boolean;
  error?: string;
  onPublish: (id: string, scheduledAt?: string) => void;
  onClose: () => void;
}) {
  const requested = link.post?.requestedPublication;
  const [mode, setMode] = useState<"now" | "schedule">(
    requested === "now" ? "now" : "schedule",
  );
  const planned = link.campaign?.plannedAt
    ? new Date(link.campaign.plannedAt)
    : null;
  const [date, setDate] = useState(() =>
    planned
      ? [
          planned.getFullYear(),
          String(planned.getMonth() + 1).padStart(2, "0"),
          String(planned.getDate()).padStart(2, "0"),
        ].join("-")
      : "",
  );
  const [time, setTime] = useState(() =>
    planned
      ? planned.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
  );
  const instant =
    mode === "schedule"
      ? (requested ?? localDateTimeInputToIso(date, time))
      : null;
  const [invalidTime, setInvalidTime] = useState(false);
  const disabled = pending || (mode === "schedule" && !instant);
  return (
    <Modal
      open
      title="Publish placement"
      onClose={pending ? () => {} : onClose}
      size="sm"
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (disabled) return;
          if (instant && Date.parse(instant) <= Date.now()) {
            setInvalidTime(true);
            return;
          }
          setInvalidTime(false);
          onPublish(link.id, instant ?? undefined);
        }}
      >
        <p className="text-sm text-neutral-300">
          {link.title} · {link.channel?.title}
        </p>
        <FormField label="Publish">
          <CustomSelect
            value={mode}
            disabled={Boolean(requested)}
            onChange={(value) => setMode(value === "now" ? "now" : "schedule")}
            options={[
              { value: "schedule", label: "Schedule" },
              { value: "now", label: "Publish now" },
            ]}
          />
        </FormField>
        {mode === "schedule" && !requested ? (
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date" required>
              <DateInput
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </FormField>
            <FormField
              label={`Time (${Intl.DateTimeFormat().resolvedOptions().timeZone})`}
              required
            >
              <TimeInput
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </FormField>
          </div>
        ) : null}
        {requested && requested !== "now" ? (
          <p className="text-sm text-neutral-300">
            {new Date(requested).toLocaleString()}
          </p>
        ) : null}
        {invalidTime ? (
          <FormError message="Choose a future date and time." />
        ) : null}
        {error ? <FormError message={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={disabled}>
            {pending ? "Saving…" : mode === "now" ? "Publish now" : "Schedule"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
