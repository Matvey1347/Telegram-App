"use client";

import type { MutualPromotionInviteLinkOption } from "@telegram-system/shared";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import type { Account, TelegramChannel } from "@/lib/api";
import {
  CustomSelect,
  FormField,
  Input,
  MultiSelect,
  Select,
} from "@/components/ui/primitives";
import type { ParticipantDraft } from "./mutual-promotion-form-types";

export function MutualPromotionParticipantsEditor({
  channels,
  accounts,
  participants,
  inviteLinks,
  inviteLinksLoading,
  onChange,
}: {
  channels: TelegramChannel[];
  accounts: Account[];
  participants: ParticipantDraft[];
  inviteLinks: MutualPromotionInviteLinkOption[];
  inviteLinksLoading: boolean;
  onChange: (participants: ParticipantDraft[]) => void;
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
    onChange(
      channelIds.flatMap((channelId) => {
        const current = byChannel.get(channelId);
        if (current) return [current];
        if (!channelById.has(channelId)) return [];
        return [
          {
            channelId,
            role: "PUBLISHER" as const,
            inviteLinkId: "",
            inviteLinkMode: "FOLDER_ONLY" as const,
            accountId: "",
            amount: "",
          },
        ];
      }),
    );
  };

  const update = (
    channelId: string,
    patch: Partial<ParticipantDraft> & { role?: ParticipantDraft["role"] },
  ) => {
    const current = byChannel.get(channelId);
    if (!current) return;
    const next = { ...current, ...patch };
    onChange(
      participants.map((participant) =>
        participant.channelId === channelId ? next : participant,
      ),
    );
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
      <div className="grid max-h-[42vh] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
        {selectedChannels.map((channel) => {
          const participant = byChannel.get(channel.id)!;
          const role = participant.role;
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
                  ? "border-amber-800/70 md:col-span-2"
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
                  role === "PAID" ? "sm:grid-cols-2" : ""
                }`}
              >
                <div className="grid content-start gap-3">
                  <FormField label="Participation">
                    <Select
                      value={role}
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
                      placeholder={
                        inviteLinksLoading ? "Loading links…" : "Select link"
                      }
                      options={channelLinks.map((link) => ({
                        value: link.id,
                        label: link.name,
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
                    />
                  </FormField>
                  <FormField label="Link use">
                    <Select
                      value={participant.inviteLinkMode}
                      onChange={(event) =>
                        update(channel.id, {
                          inviteLinkMode: event.target.value as
                            | "FOLDER_ONLY"
                            | "REUSABLE",
                        })
                      }
                    >
                      <option value="FOLDER_ONLY">📁 Only this folder</option>
                      <option value="REUSABLE">♻️ Reusable for folders</option>
                    </Select>
                  </FormField>
                </div>
                {role === "PAID" ? (
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
