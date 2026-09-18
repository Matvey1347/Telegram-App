import type {
  TelegramPostButtonRows,
  TelegramPostMediaItem,
} from "@telegram-system/shared";
import type { Promo } from "@/lib/api";

export const PROMO_INVITE_LINK_TOKEN = "{{invite_link}}";
const TELEGRAM_LINK_PATTERN =
  /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[^\s<>()\[\]"']*[^\s<>()\[\]"'.,!?;:]/gi;
const TELEGRAM_LINK_ONLY_PATTERN =
  /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[^\s<>()\[\]"']+$/i;

export type ReusablePromoPost = {
  text: string;
  plainText?: string | null;
  formattedHtml?: string | null;
  imageUrls: string[];
  mediaItems?: TelegramPostMediaItem[];
  buttonRows: TelegramPostButtonRows;
};

function replaceEvery(
  value: string,
  candidates: string[],
  replacement: string,
) {
  return candidates.reduce(
    (current, candidate) => current.split(candidate).join(replacement),
    value,
  );
}

export function replacePromoInviteLinksWithToken(
  post: ReusablePromoPost,
  inviteUrls: string[],
) {
  const candidates = [...new Set(inviteUrls.map((url) => url.trim()))]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  return {
    ...post,
    text: replaceEvery(post.text, candidates, PROMO_INVITE_LINK_TOKEN),
    plainText: post.plainText
      ? replaceEvery(post.plainText, candidates, PROMO_INVITE_LINK_TOKEN)
      : post.plainText,
    formattedHtml: post.formattedHtml
      ? replaceEvery(post.formattedHtml, candidates, PROMO_INVITE_LINK_TOKEN)
      : post.formattedHtml,
    buttonRows: post.buttonRows.map((row) =>
      row.map((button) => ({
        ...button,
        url: candidates.includes(button.url.trim())
          ? PROMO_INVITE_LINK_TOKEN
          : replaceEvery(button.url, candidates, PROMO_INVITE_LINK_TOKEN),
      })),
    ),
  };
}

/** Turns every Telegram destination in an imported promo into its reusable invite placeholder. */
export function replacePromoTelegramLinksWithToken(post: ReusablePromoPost) {
  const replaceTelegramLinks = (value: string) =>
    value.replace(TELEGRAM_LINK_PATTERN, PROMO_INVITE_LINK_TOKEN);
  return {
    ...post,
    text: replaceTelegramLinks(post.text),
    plainText: post.plainText
      ? replaceTelegramLinks(post.plainText)
      : post.plainText,
    formattedHtml: post.formattedHtml
      ? replaceTelegramLinks(post.formattedHtml)
      : post.formattedHtml,
    buttonRows: post.buttonRows.map((row) =>
      row.map((button) => ({
        ...button,
        url: TELEGRAM_LINK_ONLY_PATTERN.test(button.url.trim())
          ? PROMO_INVITE_LINK_TOKEN
          : button.url,
      })),
    ),
  };
}

export function renderPromoInviteLink(
  post: ReusablePromoPost,
  inviteUrl: string,
) {
  const replacement = inviteUrl.trim();
  return {
    ...post,
    text: post.text.split(PROMO_INVITE_LINK_TOKEN).join(replacement),
    plainText: post.plainText?.split(PROMO_INVITE_LINK_TOKEN).join(replacement),
    formattedHtml: post.formattedHtml
      ?.split(PROMO_INVITE_LINK_TOKEN)
      .join(replacement),
    buttonRows: post.buttonRows.map((row) =>
      row.map((button) => ({
        ...button,
        url: button.url.split(PROMO_INVITE_LINK_TOKEN).join(replacement),
      })),
    ),
  };
}

export function promoContainsInviteToken(post: ReusablePromoPost) {
  return (
    post.text.includes(PROMO_INVITE_LINK_TOKEN) ||
    Boolean(post.formattedHtml?.includes(PROMO_INVITE_LINK_TOKEN)) ||
    post.buttonRows.some((row) =>
      row.some((button) => button.url.includes(PROMO_INVITE_LINK_TOKEN)),
    )
  );
}

export function renderSelectedPromoDraft(promo: Promo, inviteUrl: string) {
  const imageUrls = promo.imageUrls?.length
    ? promo.imageUrls
    : promo.imageData
      ? [promo.imageData]
      : [];
  return {
    title: promo.title,
    ...renderPromoInviteLink(
      {
        text: promo.text ?? "",
        plainText: promo.plainText,
        formattedHtml: promo.formattedHtml,
        imageUrls,
        mediaItems: promo.mediaItems,
        buttonRows: promo.buttonRows ?? [],
      },
      inviteUrl,
    ),
  };
}
