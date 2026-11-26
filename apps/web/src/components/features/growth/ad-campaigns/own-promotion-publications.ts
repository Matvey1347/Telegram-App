import type { CrossPromotionTargetInput, TelegramSystemBotPostDraft } from "@telegram-system/shared";
import type { Promo, TelegramInviteLinkOption } from "@/lib/api";
import {
  promoContainsInviteToken,
  renderPromoInviteLink,
  renderSelectedPromoDraft,
  replacePromoInviteLinksWithToken,
} from "./promo-invite-template";

type ResolvedTarget = { promo?: Promo; inviteLink?: TelegramInviteLinkOption };

export function ownPromotionTargets(
  targets: CrossPromotionTargetInput[],
  publisherIds: string[],
) {
  return targets.flatMap(({ publisherInviteLinks, ...target }) => {
    const links = publisherInviteLinks ?? {};
    const shared = publisherIds.some((id) => !links[id]) ? [target] : [];
    return [
      ...shared,
      ...publisherIds.flatMap((id) => links[id] ? [{
        ...target, publisherChannelId: id, inviteLinkId: links[id].id,
      }] : []),
    ];
  });
}

function applyTrackingLink(post: TelegramSystemBotPostDraft, url: string, sharedUrl?: string) {
  const replacements = sharedUrl ? replacePromoInviteLinksWithToken(post, [sharedUrl]) : post;
  const normalized = {
    ...post, ...replacements,
    formattedHtml: replacements.formattedHtml ?? undefined,
    plainText: replacements.plainText ?? undefined,
  };
  if (promoContainsInviteToken(normalized)) return { ...normalized, ...renderPromoInviteLink(normalized, url) };
  if ([normalized.text, normalized.formattedHtml, ...normalized.buttonRows.flatMap((row) => row.map((button) => button.url))]
    .some((value) => value?.includes(url))) return normalized;
  const escapedUrl = url.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return {
    ...normalized,
    text: [normalized.text, url].filter(Boolean).join("\n\n"),
    plainText: normalized.plainText ? `${normalized.plainText}\n\n${url}` : undefined,
    formattedHtml: normalized.formattedHtml ? `${normalized.formattedHtml}\n\n<a href="${escapedUrl}">${escapedUrl}</a>` : undefined,
  };
}

export function ownPromotionPost(
  mode: "PROMO" | "CUSTOM",
  customPost: TelegramSystemBotPostDraft,
  targets: CrossPromotionTargetInput[],
  resolve: (target: CrossPromotionTargetInput, index: number) => ResolvedTarget | undefined,
  publisherId: string,
) {
  if (!targets.length) return null;
  let post = mode === "CUSTOM" ? customPost : null;
  if (post && !(post.text.trim() || post.imageUrls.length || post.mediaItems?.length)) return null;
  for (const [index, target] of targets.entries()) {
    const selected = resolve(target, index);
    const unique = target.publisherInviteLinks?.[publisherId];
    const url = unique?.url ?? selected?.inviteLink?.url;
    if (!url) return null;
    if (!post) {
      if (!selected?.promo) return null;
      post = renderSelectedPromoDraft(selected.promo, url);
    }
    post = applyTrackingLink(post, url, selected?.inviteLink?.url);
  }
  return post;
}
