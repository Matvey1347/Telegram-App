import type { CrmContactListItem } from "@telegram-system/shared";

export type CrmContactChatPreview = Pick<
  CrmContactListItem,
  "id" | "displayName" | "telegramUsername"
> & { photoUrl: string | null };

export function crmContactChatPreview(
  contact: CrmContactListItem,
): CrmContactChatPreview {
  return {
    id: contact.id,
    displayName: contact.displayName,
    telegramUsername: contact.telegramUsername,
    photoUrl: contact.peer?.photoUrl ?? null,
  };
}
