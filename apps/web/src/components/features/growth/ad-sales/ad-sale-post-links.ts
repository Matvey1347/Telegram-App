import { PROMO_INVITE_LINK_TOKEN } from "../ad-campaigns/promo-invite-template";
import type { ReusablePromoPost } from "../ad-campaigns/promo-invite-template";

const LINK_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>()\[\]{}"'`]+|(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}\/[^\s<>()\[\]{}"'`]+/gi;

function replaceTextLinks(value: string, replacement: string) {
  const replaceUrl = (url: string) => {
    const trailingPunctuation = url.match(/[.,!?;:]+$/)?.[0] ?? "";
    return `${replacement}${trailingPunctuation}`;
  };
  return value
    .replace(LINK_PATTERN, replaceUrl)
    .split(PROMO_INVITE_LINK_TOKEN)
    .join(replacement);
}

/** Replace every body and button link while keeping surrounding post formatting. */
export function replaceAdSalePostLinks<T extends ReusablePromoPost>(
  post: T,
  replacement: string,
): T {
  const link = replacement.trim();
  if (!link) return post;
  return {
    ...post,
    text: replaceTextLinks(post.text, link),
    plainText: post.plainText
      ? replaceTextLinks(post.plainText, link)
      : post.plainText,
    formattedHtml: post.formattedHtml
      ? replaceTextLinks(post.formattedHtml, link)
      : post.formattedHtml,
    buttonRows: post.buttonRows.map((row) =>
      row.map((button) => ({ ...button, url: link })),
    ),
  } as T;
}
