import type { TelegramInviteLink } from "@/lib/api-types";

export function telegramInviteLinkOptionLabel(
  link: Pick<
    TelegramInviteLink,
    | "name"
    | "isDefaultForChannel"
    | "isDefaultForBot"
    | "isDefaultForBroadcast"
    | "isDefaultForAudienceTransfer"
    | "isDefaultForFolders"
    | "isDefaultForMutualPromotion"
  >,
) {
  const uses = [
    link.isDefaultForChannel ? "Default" : null,
    link.isDefaultForBot ? "Bot" : null,
    link.isDefaultForBroadcast ? "Broadcast" : null,
    link.isDefaultForAudienceTransfer ? "Audience transfer" : null,
    link.isDefaultForFolders ? "Folders" : null,
    link.isDefaultForMutualPromotion ? "VP" : null,
  ].filter(Boolean);
  return uses.length ? `${link.name} · ${uses.join(" · ")}` : link.name;
}

export function isTelegramInviteLink(value: string) {
  return /^https:\/\/t\.me\/(?:\+|joinchat\/)[A-Za-z0-9_-]+$/i.test(
    value.trim(),
  );
}
