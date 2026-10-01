"use client";

import type { TelegramInviteLinkOption } from "@/lib/api";
import { CustomSelect } from "@/components/ui/primitives";
import {
  isTelegramInviteLink,
  telegramInviteLinkOptionLabel,
} from "@/lib/features/telegram/telegram-invite-link-options";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import { TelegramInviteLinkCreatorAvatar } from "./telegram-invite-link-creator-avatar";
import { TelegramInviteLinkOptionLabel } from "./telegram-invite-link-option-label";

/** Shared compact selector for every single invite-link choice. */
export function TelegramInviteLinkSelect({
  value,
  links,
  placeholder = "Select invite link",
  disabled,
  loading,
  loadingLabel = "Loading invite links…",
  onOpen,
  onChange,
  onCreate,
}: {
  value: string;
  links: TelegramInviteLinkOption[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  onOpen?: () => void;
  onChange: (value: string) => void;
  onCreate?: (url: string) => void | Promise<void>;
}) {
  return (
    <CustomSelect
      value={value}
      onChange={onChange}
      disabled={disabled}
      onOpen={onOpen}
      loading={loading}
      loadingLabel={loadingLabel}
      placeholder={placeholder}
      searchPlaceholder="Search invite links"
      options={links.map((link) => ({
        value: link.id,
        label: telegramInviteLinkOptionLabel(link),
        labelContent: <TelegramInviteLinkOptionLabel link={link} />,
        meta: link.url,
        iconFallback: inviteLinkCreatorFallback(link),
        icon: (
          <TelegramInviteLinkCreatorAvatar
            photoUrl={link.creatorPhotoUrl}
            label={inviteLinkCreatorFallback(link)}
          />
        ),
      }))}
      canCreateOption={
        onCreate
          ? (input) =>
              isTelegramInviteLink(input) &&
              !links.some((link) => link.url === input.trim())
          : undefined
      }
      createOptionLabel={
        onCreate ? () => "Verify and add this invite link" : undefined
      }
      onCreateOption={onCreate}
    />
  );
}
