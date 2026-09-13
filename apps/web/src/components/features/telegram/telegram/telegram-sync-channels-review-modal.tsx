"use client";

import { useState, type ReactNode } from "react";
import type {
  TelegramSyncedDialogChannel,
  TelegramUserAccount,
  TelegramUserAccountSyncDialogsResponse,
} from "@/lib/api";
import { Button, Modal } from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "./telegram-entity-avatar";

export function TelegramSyncChannelsReviewModal({
  account,
  accountName,
  response,
  isSaving,
  onClose,
  onSubmit,
  renderRoleBadge,
  renderNewCountBadge,
}: {
  account: TelegramUserAccount;
  accountName: string;
  response: TelegramUserAccountSyncDialogsResponse;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (channelIds: string[]) => void;
  renderRoleBadge: (channel: TelegramSyncedDialogChannel) => ReactNode;
  renderNewCountBadge: (count: number) => ReactNode;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const syncedChannels = response.syncedChannels || [];
  const availableChannels = response.availableChannels || [];
  const allSelected =
    availableChannels.length > 0 &&
    selectedIds.length === availableChannels.length;
  const toggleChannel = (channelId: string) => {
    setSelectedIds((current) =>
      current.includes(channelId)
        ? current.filter((item) => item !== channelId)
        : [...current, channelId],
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sync channels: ${accountName}`}
      leadingHeaderAction={
        <TelegramEntityAvatar
          imageUrl={account.photoUrl}
          kind="mtproto"
          alt={accountName}
          size="md"
        />
      }
    >
      <div className="space-y-4 text-sm">
        <section className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-100">
                {syncedChannels.length} synchronized
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Existing workspace channels linked to {accountName}.
              </p>
            </div>
            {renderNewCountBadge(availableChannels.length)}
          </div>
          {syncedChannels.length ? (
            <div className="mt-3 space-y-2">
              {syncedChannels.map((channel) => (
                <ChannelRow
                  key={channel.channelId}
                  channel={channel}
                  roleBadge={renderRoleBadge(channel)}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              No existing workspace channels matched this Telegram account.
            </p>
          )}
        </section>

        <section className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-slate-100">Add new channels</p>
              <p className="mt-1 text-xs text-slate-400">
                Selected channels will be created and linked to {accountName}.
              </p>
            </div>
            {availableChannels.length ? (
              <Button
                variant="secondary"
                type="button"
                onClick={() =>
                  setSelectedIds(
                    allSelected
                      ? []
                      : availableChannels.map((channel) => channel.channelId),
                  )
                }
              >
                {allSelected ? "Clear" : "Select all"}
              </Button>
            ) : null}
          </div>
          {availableChannels.length ? (
            <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {availableChannels.map((channel) => {
                const checked = selectedIds.includes(channel.channelId);
                return (
                  <label
                    key={channel.channelId}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 ${
                      checked
                        ? "border-blue-500 bg-blue-950/30"
                        : "border-slate-800 bg-slate-950/30 hover:border-slate-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChannel(channel.channelId)}
                      className="h-4 w-4 accent-blue-500"
                    />
                    <div className="min-w-0 flex-1">
                      <ChannelRow
                        channel={channel}
                        roleBadge={renderRoleBadge(channel)}
                      />
                    </div>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              No new admin channels found for this account.
            </p>
          )}
        </section>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            disabled={!selectedIds.length || isSaving}
            onClick={() => onSubmit(selectedIds)}
          >
            {isSaving ? "Adding..." : `Add ${selectedIds.length || ""}`.trim()}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChannelRow({
  channel,
  roleBadge,
}: {
  channel: TelegramSyncedDialogChannel;
  roleBadge: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <TelegramEntityAvatar
          imageUrl={channel.photoUrl}
          kind="channel"
          alt={channel.title}
          size="sm"
        />
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-100">
            {channel.title}
          </p>
          <p className="truncate text-xs text-slate-400">
            {channel.username
              ? `@${channel.username}`
              : channel.telegramChannelId}
          </p>
        </div>
      </div>
      {roleBadge}
    </div>
  );
}
