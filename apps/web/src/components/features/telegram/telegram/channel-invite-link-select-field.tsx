"use client";

import type { TelegramInviteLink } from "@/lib/api";
import { CustomSelect, FormField } from "@/components/ui/primitives";
import {
  isTelegramInviteLink,
  telegramInviteLinkDefaultBadgeClassName,
  telegramInviteLinkOptionLabel,
} from "@/lib/features/telegram/telegram-invite-link-options";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import { TelegramInviteLinkCreatorAvatar } from "./telegram-invite-link-creator-avatar";

export function ChannelInviteLinkSelectField({
  label,
  value,
  links,
  placeholder,
  helpText,
  disabled,
  loading,
  onOpen,
  onChange,
  onCreate,
}: {
  label: string;
  value: string;
  links: TelegramInviteLink[];
  placeholder: string;
  helpText?: string;
  disabled?: boolean;
  loading?: boolean;
  onOpen: () => void;
  onChange: (value: string) => void;
  onCreate?: (url: string) => void | Promise<void>;
}) {
  return (
    <FormField label={label}>
      <CustomSelect
        value={value}
        onChange={onChange}
        disabled={disabled}
        onOpen={onOpen}
        loading={loading}
        loadingLabel="Loading invite links…"
        placeholder={placeholder}
        searchPlaceholder="Search invite links"
        options={links.map((link) => ({
          value: link.id,
          label: telegramInviteLinkOptionLabel(link),
          badgeClassName: telegramInviteLinkDefaultBadgeClassName(link),
          meta: link.url,
          iconFallback: inviteLinkCreatorFallback(link),
          icon: (
            <TelegramInviteLinkCreatorAvatar
              photoUrl={link.creatorPhotoUrl}
              memberAvatar={link.creatorMember?.avatarPresentation}
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
      {helpText ? <p className="text-xs text-neutral-500">{helpText}</p> : null}
    </FormField>
  );
}
