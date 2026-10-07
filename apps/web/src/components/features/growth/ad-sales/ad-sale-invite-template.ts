import { renderPromoInviteLink } from "../ad-campaigns/promo-invite-template";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";

/** Keeps the promo placeholder semantics while retaining the sale post title. */
export function renderAdSaleInviteLink(
  draft: PlacementManagedPostDraft,
  inviteLinkUrl: string,
): PlacementManagedPostDraft {
  return { ...draft, ...renderPromoInviteLink(draft, inviteLinkUrl) };
}
