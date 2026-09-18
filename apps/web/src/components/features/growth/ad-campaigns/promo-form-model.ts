import {
  normalizeTelegramPostMediaItems,
  type TelegramPostButtonRows,
  type TelegramPostMediaItem,
} from "@telegram-system/shared";
import type { Promo } from "@/lib/api";
import type { ReusablePromoPost } from "./promo-invite-template";

export type PromoFormPayload = {
  telegramChannelId: string;
  assignedMemberId?: string | null;
  iconId?: string | null;
  title: string;
  text: string;
  plainText?: string | null;
  formattedHtml?: string | null;
  imageData?: string;
  imageUrls: string[];
  mediaItems: TelegramPostMediaItem[];
  buttonRows: TelegramPostButtonRows;
  defaultInviteLinkId?: string | null;
};

export type PromoModalDraft = {
  iconId: string | null;
  assignedMemberId: string | null;
  channelId: string;
  inviteLinkId: string;
  title: string;
  post: ReusablePromoPost;
};

export const emptyPromoPost = (): ReusablePromoPost => ({
  text: "",
  imageUrls: [],
  mediaItems: [],
  buttonRows: [],
});

export const emptyPromoModalDraft = (): PromoModalDraft => ({
  iconId: null,
  assignedMemberId: null,
  channelId: "",
  inviteLinkId: "",
  title: "",
  post: emptyPromoPost(),
});

export function isMeaningfulPromoModalDraft(draft: PromoModalDraft) {
  return Boolean(
    draft.title.trim() ||
      draft.iconId ||
      draft.assignedMemberId ||
      draft.channelId ||
      draft.inviteLinkId ||
      hasPromoPostContent(draft.post),
  );
}

export function postFromPromo(promo?: Promo): ReusablePromoPost {
  const imageUrls = promo?.imageUrls?.length
    ? promo.imageUrls
    : promo?.imageData
      ? [promo.imageData]
      : [];
  return promo
    ? {
        text: promo.text ?? "",
        plainText: promo.plainText,
        formattedHtml: promo.formattedHtml,
        imageUrls,
        mediaItems: normalizeTelegramPostMediaItems(
          promo.mediaItems,
          imageUrls,
        ),
        buttonRows: promo.buttonRows ?? [],
      }
    : emptyPromoPost();
}

export function hasPromoPostContent(post: ReusablePromoPost) {
  return Boolean(
    post.text.trim() ||
    post.imageUrls.length ||
    post.mediaItems?.length ||
    post.buttonRows.length,
  );
}

export function normalizePromoModalDraft(value: unknown): PromoModalDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<PromoModalDraft>;
  if (!draft.post || typeof draft.title !== "string") return null;
  return {
    iconId: draft.iconId ?? null,
    assignedMemberId: draft.assignedMemberId ?? null,
    channelId: draft.channelId ?? "",
    inviteLinkId: draft.inviteLinkId ?? "",
    title: draft.title,
    post: {
      ...emptyPromoPost(),
      ...draft.post,
      imageUrls: draft.post.imageUrls ?? [],
      mediaItems: draft.post.mediaItems ?? [],
      buttonRows: draft.post.buttonRows ?? [],
    },
  };
}
