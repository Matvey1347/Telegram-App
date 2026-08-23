"use client";

import { useMemo, useState } from "react";
import type { TelegramChannelSelectOption } from "@/lib/api";
import {
  Button,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "./telegram-entity-avatar";

type NetworkFormPayload = {
  name: string;
  description?: string | null;
  telegramChannelIds: string[];
};

export function TelegramNetworkFormModal({
  network,
  channels,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  network: {
    name: string;
    description?: string | null;
    channels: { id: string }[];
  } | null;
  channels: TelegramChannelSelectOption[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: NetworkFormPayload) => void;
}) {
  const [name, setName] = useState(network?.name || "");
  const [description, setDescription] = useState(network?.description || "");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    network?.channels.map((channel) => channel.id) || [],
  );
  const [error, setError] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleChannel = (channelId: string) => {
    setSelectedIds((current) =>
      current.includes(channelId)
        ? current.filter((item) => item !== channelId)
        : [...current, channelId],
    );
  };
  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (selectedIds.length < 2) {
      setError("Network must contain at least 2 channels.");
      return;
    }
    onSubmit({
      name: trimmedName,
      description: description.trim() || null,
      telegramChannelIds: selectedIds,
    });
  };

  return (
    <Modal open onClose={onClose} title="Edit network">
      <div className="space-y-4">
        <FormField label="Name" required>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>
        <FormField label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">Channels</p>
          <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-800 p-2">
            {channels.map((channel) => (
              <ChannelSelectRow
                key={channel.id}
                channel={channel}
                checked={selectedSet.has(channel.id)}
                onToggle={() => toggleChannel(channel.id)}
              />
            ))}
            {!channels.length ? (
              <p className="p-2 text-sm text-slate-400">
                No own channels available.
              </p>
            ) : null}
          </div>
          {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSubmitting} onClick={submit}>
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChannelSelectRow({
  channel,
  checked,
  onToggle,
}: {
  channel: TelegramChannelSelectOption;
  checked: boolean;
  onToggle: () => void;
}) {
  const username = channel.username
    ? `@${String(channel.username).replace(/^@/, "")}`
    : "";
  return (
    <label
      className={`flex items-center gap-3 rounded-md border p-2 text-sm transition ${
        checked
          ? "border-blue-700 bg-slate-900"
          : "border-slate-800 bg-slate-900/30 hover:border-slate-700"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0"
      />
      <TelegramEntityAvatar
        imageUrl={channel.photoUrl}
        kind="channel"
        alt={channel.title}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-tight text-slate-100">
          {channel.title}
        </p>
        {username ? (
          <p className="mt-0.5 truncate text-xs text-slate-400">{username}</p>
        ) : null}
      </div>
    </label>
  );
}
