"use client";

import type { MutualPromotionInviteLinkOption } from "@telegram-system/shared";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import {
  isTelegramInviteLink,
  telegramInviteLinkOptionLabel,
} from "@/lib/features/telegram/telegram-invite-link-options";
import { TelegramInviteLinkOptionLabel } from "@/components/features/telegram/telegram/telegram-invite-link-option-label";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import type { Account, TelegramChannel } from "@/lib/api";
import {
  CustomSelect,
  FormField,
  Input,
  MultiSelect,
  Select,
} from "@/components/ui/primitives";
import type {
  BulkExpenseDraft,
  ParticipantDraft,
} from "./mutual-promotion-form-types";
import { MutualPromotionBulkExpenseControls } from "./mutual-promotion-bulk-expense-controls";

export function MutualPromotionParticipantsEditor({
  channels,
  accounts,
  participants,
  bulkExpense,
  inviteLinks,
  inviteLinksLoading,
  onInviteLinksOpen,
  onRegisterInviteLink,
  onChange,
}: {
  channels: TelegramChannel[];
  accounts: Account[];
  participants: ParticipantDraft[];
  bulkExpense: BulkExpenseDraft;
  inviteLinks: MutualPromotionInviteLinkOption[];
  inviteLinksLoading: boolean;
  onInviteLinksOpen?: () => void;
  onRegisterInviteLink?: (channelId: string, url: string) => Promise<void>;
  onChange: (value: {
    participants: ParticipantDraft[];
    bulkExpense: BulkExpenseDraft;
  }) => void;
}) {
  const byChannel = new Map(
    participants.map((participant) => [participant.channelId, participant]),
  );
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const selectedChannelIds = participants.map(
    (participant) => participant.channelId,
  );
  const selectedChannels = selectedChannelIds.flatMap((channelId) => {
    const channel = channelById.get(channelId);
    return channel ? [channel] : [];
  });

  const selectChannels = (channelIds: string[]) => {
    const nextParticipants = channelIds.flatMap((channelId) => {
      const current = byChannel.get(channelId);
      if (current) return [current];
      if (!channelById.has(channelId)) return [];
      return [
        {
          channelId,
          role: "PUBLISHER" as const,
          inviteLinkId: "",
          accountId: "",
          amount: "",
        },
      ];
    });
    onChange({ participants: nextParticipants, bulkExpense });
  };

  const update = (
    channelId: string,
    patch: Partial<ParticipantDraft> & { role?: ParticipantDraft["role"] },
  ) => {
    const current = byChannel.get(channelId);
    if (!current) return;
    const next = { ...current, ...patch };
    onChange({
      participants: participants.map((participant) =>
        participant.channelId === channelId ? next : participant,
      ),
      bulkExpense,
    });
  };

  const updateBulkExpense = (next: BulkExpenseDraft) => {
    onChange({
      participants,
      bulkExpense: next,
    });
  };

  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-white">Channels</h4>
        <p className="text-xs text-neutral-400">
          Select your channels, then choose which publish and which pay without
          publishing.
        </p>
      </div>
      <MultiSelect
        value={selectedChannelIds}
        onChange={selectChannels}
        placeholder="Select channels"
        searchPlaceholder="Search your channels"
        options={channels.map((channel) => ({
          value: channel.id,
          label: channel.username
            ? `${channel.title} · @${channel.username}`
            : channel.title,
          selectedLabel: channel.title,
          iconUrl: channel.photoUrl,
          iconFallback: channel.title,
        }))}
      />
      <MutualPromotionBulkExpenseControls
        value={bulkExpense}
        channelCount={selectedChannels.length}
        accounts={accounts}
        onChange={updateBulkExpense}
      />
      <div className="grid min-w-0 gap-2 overflow-visible md:max-h-[42vh] md:overflow-y-auto md:pr-1 xl:grid-cols-2">
        {selectedChannels.map((channel) => {
          const participant = byChannel.get(channel.id)!;
          const role = bulkExpense.enabled ? "PAID" : participant.role;
          const channelLinks = inviteLinks.filter(
            (link) =>
              link.telegramChannelId === channel.id &&
              (link.available || link.id === participant?.inviteLinkId),
          );
          return (
            <div
              key={channel.id}
              className={`rounded-xl border bg-neutral-950/60 p-3 ${
                role === "PAID"
                  ? "border-amber-800/70 xl:col-span-2"
                  : "border-neutral-800"
              }`}
            >
              <div className="mb-3 flex min-w-0 items-center gap-2">
                {channel.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={channel.photoUrl}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-xs">
                    {channel.title.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="truncate text-sm font-medium text-white">
                  {channel.title}
                </span>
              </div>
              <div
                className={`grid gap-3 ${
                  role === "PAID" && !bulkExpense.enabled
                    ? "lg:grid-cols-2"
                    : ""
                }`}
              >
                <div className="grid content-start gap-3">
                  <FormField label="Participation">
                    <Select
                      value={role}
                      disabled={bulkExpense.enabled}
                      onChange={(event) =>
                        update(channel.id, {
                          role: event.target.value as ParticipantDraft["role"],
                        })
                      }
                    >
                      <option value="PUBLISHER">📣 Publisher</option>
                      <option value="PAID">💳 Paid</option>
                    </Select>
                  </FormField>
                  <FormField label="Invite link" required>
                    <CustomSelect
                      value={participant.inviteLinkId}
                      onChange={(inviteLinkId) =>
                        update(channel.id, { inviteLinkId })
                      }
                      disabled={inviteLinksLoading}
                      onOpen={onInviteLinksOpen}
                      loading={inviteLinksLoading}
                      loadingLabel="Loading invite links…"
                      placeholder="Select link"
                      options={channelLinks.map((link) => ({
                        value: link.id,
                        label: telegramInviteLinkOptionLabel(link),
                        labelContent: (
                          <TelegramInviteLinkOptionLabel link={link} />
                        ),
                        meta: link.url,
                        iconFallback: inviteLinkCreatorFallback(link),
                        icon: (
                          <TelegramInviteLinkCreatorAvatar
                            photoUrl={link.creatorPhotoUrl}
                            memberAvatar={
                              link.creatorMember?.avatarPresentation
                            }
                            label={inviteLinkCreatorFallback(link)}
                          />
                        ),
                        tone: link.available ? undefined : "warning",
                      }))}
                      canCreateOption={
                        onRegisterInviteLink
                          ? (input) =>
                              isTelegramInviteLink(input) &&
                              !channelLinks.some(
                                (link) => link.url === input.trim(),
                              )
                          : undefined
                      }
                      createOptionLabel={() =>
                        "Verify and add this invite link"
                      }
                      onCreateOption={
                        onRegisterInviteLink
                          ? (url) => onRegisterInviteLink(channel.id, url)
                          : undefined
                      }
                    />
                  </FormField>
                </div>
                {role === "PAID" && !bulkExpense.enabled ? (
                  <aside
                    aria-label="Paid participation details"
                    className="grid content-start gap-3 rounded-xl border border-amber-800/60 bg-amber-950/20 p-3"
                  >
                    <div>
                      <h5 className="text-sm font-semibold text-amber-100">
                        💳 Paid participation
                      </h5>
                      <p className="text-xs text-amber-200/60">
                        Record this channel&apos;s cost for this folder.
                      </p>
                    </div>
                    <FormField label="Expense account">
                      <CustomSelect
                        value={participant.accountId}
                        onChange={(accountId) =>
                          update(channel.id, { accountId })
                        }
                        placeholder="Add later"
                        options={accounts.map((account) => ({
                          value: account.id,
                          label: account.name,
                          meta: account.currency,
                          iconPresentation:
                            account.iconPresentation ?? undefined,
                          iconFallback: account.name,
                        }))}
                      />
                    </FormField>
                    <FormField label="Participation expense">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={participant.amount}
                        onChange={(event) =>
                          update(channel.id, { amount: event.target.value })
                        }
                        placeholder="0.00"
                      />
                    </FormField>
                  </aside>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {!selectedChannels.length ? (
        <p className="text-sm text-neutral-500">
          Select one or more channels above.
        </p>
      ) : null}
    </section>
  );
}
