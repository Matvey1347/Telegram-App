"use client";

import type { TelegramInviteLink } from "@/lib/api";
import { useTelegramInviteLinkOptions } from "@/lib/features/telegram/use-telegram-invite-link-options";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import {
  telegramInviteLinkDefaultBadgeClassName,
  telegramInviteLinkOptionLabel,
} from "@/lib/features/telegram/telegram-invite-link-options";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import { CampaignMultiValueSelect } from "./campaign-multi-value-select";

export function CampaignInviteLinksSelect({
  channelId,
  campaignId,
  value,
  initialLinks,
  enabled,
  onChange,
}: {
  channelId: string;
  campaignId?: string;
  value: string[];
  initialLinks: TelegramInviteLink[];
  enabled: boolean;
  onChange: (value: string[]) => void;
}) {
  const query = useTelegramInviteLinkOptions({
    channelId,
    selectedId: value[0],
    enabled,
    includeUnavailable: false,
    availableForCampaignId: campaignId,
    seedLinks: initialLinks,
  });

  return (
    <CampaignMultiValueSelect
      value={value}
      onChange={onChange}
      onOpen={query.requestAll}
      loading={query.loading}
      loadingLabel="Loading invite links…"
      placeholder="Select invite links"
      options={query.links.map((link) => ({
        value: link.id,
        label: telegramInviteLinkOptionLabel(link),
        badgeClassName: telegramInviteLinkDefaultBadgeClassName(link),
        description: link.url,
        searchText: link.url,
        iconFallback: inviteLinkCreatorFallback(link),
        icon: (
          <TelegramInviteLinkCreatorAvatar
            photoUrl={link.creatorPhotoUrl}
            memberAvatar={link.creatorMember?.avatarPresentation}
            label={inviteLinkCreatorFallback(link)}
          />
        ),
      }))}
    />
  );
}
