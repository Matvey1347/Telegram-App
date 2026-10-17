import type { ResolvedEmoji } from "@telegram-system/shared";

/**
 * The select control supports emoji, not account images. Keep every account
 * option identifiable when the stored presentation is an uploaded image.
 */
export function financeAccountSelectEmoji(account: {
  iconPresentation?: ResolvedEmoji;
}) {
  return account.iconPresentation?.type === "unicode"
    ? account.iconPresentation.value
    : "💳";
}
