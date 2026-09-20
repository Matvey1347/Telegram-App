"use client";

import {
  ArrowRightLeft,
  Bot,
  Folder,
  Handshake,
  Mail,
  Star,
} from "lucide-react";
import type { TelegramInviteLink } from "@/lib/api";

type LinkPresentation = Pick<TelegramInviteLink, "name"> &
  Partial<
    Pick<
      TelegramInviteLink,
      | "isDefaultForChannel"
      | "isDefaultForBot"
      | "isDefaultForBroadcast"
      | "isDefaultForAudienceTransfer"
      | "isDefaultForFolders"
      | "isDefaultForMutualPromotion"
    >
  >;

const purposes = [
  { key: "isDefaultForChannel", label: "Default", Icon: Star },
  { key: "isDefaultForMutualPromotion", label: "VP", Icon: Handshake },
  { key: "isDefaultForFolders", label: "Folders", Icon: Folder },
  { key: "isDefaultForBroadcast", label: "Newsletter", Icon: Mail },
  {
    key: "isDefaultForAudienceTransfer",
    label: "Transfer",
    Icon: ArrowRightLeft,
  },
  { key: "isDefaultForBot", label: "Bot", Icon: Bot },
] as const;

export function TelegramInviteLinkOptionLabel({
  link,
}: {
  link: LinkPresentation;
}) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 align-middle">
      <span className="min-w-0 truncate">{link.name}</span>
      {purposes
        .filter(({ key }) => link[key])
        .map(({ key, label, Icon }) => (
          <span
            key={key}
            title={label}
            aria-label={label}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-800/70 bg-sky-950/50 px-1.5 py-0.5 text-[11px] font-medium text-sky-300"
          >
            <Icon size={12} aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </span>
        ))}
    </span>
  );
}
