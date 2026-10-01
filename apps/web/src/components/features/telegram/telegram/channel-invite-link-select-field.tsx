"use client";

import type { TelegramInviteLinkOption } from "@/lib/api";
import { FormField } from "@/components/ui/primitives";
import { TelegramInviteLinkSelect } from "./telegram-invite-link-select";

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
  links: TelegramInviteLinkOption[];
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
      <TelegramInviteLinkSelect
        value={value}
        links={links}
        onChange={onChange}
        disabled={disabled}
        onOpen={onOpen}
        loading={loading}
        placeholder={placeholder}
        onCreate={onCreate}
      />
      {helpText ? <p className="text-xs text-neutral-500">{helpText}</p> : null}
    </FormField>
  );
}
