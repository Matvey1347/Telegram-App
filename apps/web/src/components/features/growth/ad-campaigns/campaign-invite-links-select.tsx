"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramInviteLink, TelegramInviteLinkOption } from "@/lib/api";
import { useTelegramInviteLinkOptions } from "@/lib/features/telegram/use-telegram-invite-link-options";
import { useRegisterTelegramInviteLink } from "@/lib/features/telegram/use-register-telegram-invite-link";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import {
  isTelegramInviteLink,
  telegramInviteLinkOptionLabel,
} from "@/lib/features/telegram/telegram-invite-link-options";
import { TelegramInviteLinkOptionLabel } from "@/components/features/telegram/telegram/telegram-invite-link-option-label";
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
  const [registeredLinks, setRegisteredLinks] = useState<TelegramInviteLinkOption[]>([]);
  const selectedIdsRef = useRef(value);
  useEffect(() => {
    selectedIdsRef.current = value;
  }, [value]);

  const query = useTelegramInviteLinkOptions({
    channelId,
    selectedId: value[0],
    selectedIds: value,
    enabled,
    includeUnavailable: false,
    availableForCampaignId: campaignId,
    seedLinks: initialLinks,
  });
  const registerLink = useRegisterTelegramInviteLink({
    channelId,
    onRegistered: (link) => {
      const option: TelegramInviteLinkOption = {
        id: link.id,
        telegramChannelId: channelId,
        name: link.name,
        url: link.url,
      };
      setRegisteredLinks((current) => [
        ...current.filter((item) => item.id !== link.id),
        option,
      ]);
      onChange([...new Set([...selectedIdsRef.current, link.id])]);
    },
  });

  const optionsById = new Map(
    [...query.links, ...registeredLinks.filter((link) => link.telegramChannelId === channelId)]
      .map((link) => [link.id, link]),
  );

  return (
    <CampaignMultiValueSelect
      value={value}
      onChange={onChange}
      onOpen={query.requestAll}
      loading={query.loading}
      loadingLabel="Loading invite links…"
      placeholder="Select invite links"
      options={[...optionsById.values()].map((link) => ({
        value: link.id,
        label: telegramInviteLinkOptionLabel(link),
        labelContent: <TelegramInviteLinkOptionLabel link={link} />,
        description: link.url,
        searchText: link.url,
        iconFallback: inviteLinkCreatorFallback(link),
        icon: (
          <TelegramInviteLinkCreatorAvatar
            photoUrl={link.creatorPhotoUrl}
            label={inviteLinkCreatorFallback(link)}
          />
        ),
      }))}
      canCreateOption={(input) =>
        isTelegramInviteLink(input) &&
        !query.links.some((link) => link.url === input.trim())
      }
      onCreateOption={async (url) => {
        await registerLink.mutateAsync(url);
      }}
    />
  );
}
