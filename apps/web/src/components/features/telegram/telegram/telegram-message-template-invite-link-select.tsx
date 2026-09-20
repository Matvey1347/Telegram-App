"use client";

import { useState } from "react";
import type { TelegramMessageTemplateInviteLink } from "@telegram-system/shared";
import { CustomSelect } from "@/components/ui/primitives";
import { isTelegramInviteLink } from "@/lib/features/telegram/telegram-invite-link-options";
import { useRegisterTelegramInviteLink } from "@/lib/features/telegram/use-register-telegram-invite-link";
import { TelegramInviteLinkOptionLabel } from "./telegram-invite-link-option-label";

export function TelegramMessageTemplateInviteLinkSelect({
  channelId,
  links,
  value,
  onChange,
}: {
  channelId: string;
  links: TelegramMessageTemplateInviteLink[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [added, setAdded] = useState<TelegramMessageTemplateInviteLink[]>([]);
  const options = [
    ...links,
    ...added.filter((link) => !links.some((item) => item.id === link.id)),
  ];
  const register = useRegisterTelegramInviteLink({
    channelId,
    onRegistered: (link, url) => {
      setAdded((current) => [
        ...current,
        { id: link.id, name: "Imported invite link", url, isDefault: false },
      ]);
      onChange(link.id);
    },
  });
  return (
    <>
      <CustomSelect
        value={value}
        onChange={onChange}
        disabled={register.isPending}
        placeholder="Select invite link"
        options={options.map((link) => ({
          value: link.id,
          label: link.name,
          labelContent: (
            <TelegramInviteLinkOptionLabel
              link={{ ...link, isDefaultForChannel: link.isDefault }}
            />
          ),
          meta: link.url,
        }))}
        canCreateOption={(input) =>
          isTelegramInviteLink(input) &&
          !options.some((link) => link.url === input.trim())
        }
        createOptionLabel={() => "Verify and add this invite link"}
        onCreateOption={async (url) => {
          await register.mutateAsync(url);
        }}
      />
      {register.isError ? (
        <p className="mt-1 text-xs text-rose-300">
          This invite link could not be verified for the channel.
        </p>
      ) : null}
    </>
  );
}
