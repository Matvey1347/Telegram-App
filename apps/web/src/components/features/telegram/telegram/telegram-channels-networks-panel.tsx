"use client";

import { useEffect, useMemo, useState } from "react";
import { telegramChannelAccessLabel } from "@/components/features/telegram/telegram/channel-access-badge";
import { TelegramEntityAvatar } from "@/components/features/telegram/telegram/telegram-entity-avatar";
import { TelegramNetworkCards } from "@/components/features/telegram/telegram/telegram-overview-cards";
import {
  type CurrencySettings,
  type ExchangeRate,
  type TelegramChannel,
  type TelegramChannelNetwork,
} from "@/lib/api";
import {
  Button,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  Modal,
  MultiSelect,
  Textarea,
} from "@/components/ui/primitives";
import dynamic from "next/dynamic";

const IconPicker = dynamic(
  () =>
    import("@/components/icons/icon-picker").then(
      (module) => module.IconPicker,
    ),
  { loading: () => null },
);

export function TelegramNetworksSection({
  networks,
  loading,
  error,
  moneySettings,
  rates,
  onEdit,
  onDelete,
}: {
  networks: TelegramChannelNetwork[];
  loading: boolean;
  error: unknown;
  moneySettings?: CurrencySettings | null;
  rates?: ExchangeRate[];
  onEdit: (network: TelegramChannelNetwork) => void;
  onDelete: (network: TelegramChannelNetwork) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load networks.
        </div>
      ) : null}
      {!loading && !error && !networks.length ? (
        <EmptyState text="No channel networks yet." />
      ) : null}
      {networks.length ? (
        <TelegramNetworkCards
          networks={networks}
          moneySettings={moneySettings}
          rates={rates}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}

export function NetworkFormModal({
  open,
  network,
  channels,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  network: TelegramChannelNetwork | null;
  channels: TelegramChannel[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name?: string;
    description?: string | null;
    iconId?: string | null;
    telegramChannelIds?: string[];
    excludedTelegramChannelIds?: string[];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [iconId, setIconId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(network?.name || "");
    setDescription(network?.description || "");
    setIconId(network?.iconId || null);
    setSelectedIds(
      network?.isSystem
        ? network.excludedTelegramChannelIds || []
        : network?.channels.map((channel) => channel.id) || [],
    );
    setError("");
  }, [channels, network, open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleChannel = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };
  const submit = () => {
    if (network?.isSystem) {
      onSubmit({
        excludedTelegramChannelIds: selectedIds,
      });
      return;
    }
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
      iconId,
      telegramChannelIds: selectedIds,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        network?.isSystem
          ? "Configure All network"
          : network
            ? "Edit network"
            : "Create network"
      }
    >
      <div className="space-y-4">
        {!network?.isSystem ? (
          <>
            <FormField label="Emoji">
              <IconPicker
                iconId={iconId}
                icon={network?.iconPresentation}
                onChange={setIconId}
                allowImages={false}
                buttonLabel="Choose network emoji"
              />
            </FormField>
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
          </>
        ) : (
          <p className="text-sm text-neutral-400">
            Select test or internal channels that must not be included in the
            All network or its aggregated analytics.
          </p>
        )}
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">
            {network?.isSystem ? "Channels excluded from All" : "Channels"}
          </p>
          {network?.isSystem ? (
            <MultiSelect
              value={selectedIds}
              onChange={setSelectedIds}
              options={channels.map((channel) => ({
                value: channel.id,
                label: channel.title,
                iconUrl: channel.photoUrl || undefined,
                iconFallback: channel.title.slice(0, 1).toUpperCase(),
              }))}
              placeholder="No channels excluded"
              searchPlaceholder="Search channels..."
              allSelectedLabel="All channels excluded"
            />
          ) : (
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
          )}
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
  channel: TelegramChannel;
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
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {telegramChannelAccessLabel(channel.accessMode)}
        </p>
        {username ? (
          <p className="mt-0.5 truncate text-xs text-slate-400">{username}</p>
        ) : null}
      </div>
    </label>
  );
}
