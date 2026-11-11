export type TelegramPostOrigin =
  | 'AI'
  | 'SYSTEM_MANUAL'
  | 'AD'
  | 'MUTUAL_PROMO'
  | 'EXTERNAL';

export function classifyPostOrigin(post: {
  managedPost?: {
    aiPostingGeneration?: unknown;
    adSalePlacements?: unknown[];
    mutualPromotionDelivery?: unknown;
  } | null;
  adSalePlacement?: boolean;
  mutualPromotionDelivery?: boolean;
  crossPromotion?: boolean;
}): TelegramPostOrigin {
  if (post.managedPost?.aiPostingGeneration) return 'AI';
  if (
    post.adSalePlacement ||
    (post.managedPost?.adSalePlacements?.length ?? 0) > 0
  )
    return 'AD';
  if (
    post.mutualPromotionDelivery ||
    post.crossPromotion ||
    post.managedPost?.mutualPromotionDelivery
  )
    return 'MUTUAL_PROMO';
  return post.managedPost ? 'SYSTEM_MANUAL' : 'EXTERNAL';
}
