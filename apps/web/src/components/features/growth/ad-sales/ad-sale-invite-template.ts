import { renderPromoInviteLink } from "../ad-campaigns/promo-invite-template";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";

const BOT_PREVIEW_INVITE_LINK_FALLBACK = "https://t.me";

/** Keeps the promo placeholder semantics while retaining the sale post title. */
export function renderAdSaleInviteLink(
  draft: PlacementManagedPostDraft,
  inviteLinkUrl: string,
): PlacementManagedPostDraft {
  return { ...draft, ...renderPromoInviteLink(draft, inviteLinkUrl) };
}

/**
 * Telegram rejects an inline-button URL while it still contains the reusable
 * invite placeholder. Use one real placement link when available. Before the
 * user selects a link, keep the visible template text intact and substitute a
 * harmless URL only in buttons so the draft can still be previewed in the bot.
 */
export function renderAdSaleBotPreview(
  draft: PlacementManagedPostDraft,
  inviteLinkUrl?: string | null,
): PlacementManagedPostDraft {
  const replacement = inviteLinkUrl?.trim();
  const rendered = renderAdSaleInviteLink(
    draft,
    replacement || BOT_PREVIEW_INVITE_LINK_FALLBACK,
  );
  if (replacement) return rendered;
  return {
    ...rendered,
    text: draft.text,
    plainText: draft.plainText,
    formattedHtml: draft.formattedHtml,
  };
}
