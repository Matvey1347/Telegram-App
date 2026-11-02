export type PromotionEvidence = {
  postId: string;
  sourceChannelId: string;
  targetChannelId: string;
  publishedAt: string;
  creativeHash: string;
  /** Explicitly validated as a promotional reference, not a footer or catalog. */
  promotionVerified: boolean;
  catalog: boolean;
};
export type ReciprocalEvidence = {
  forwardPostId: string;
  reversePostId: string;
  forwardAt: string;
  reverseAt: string;
  windowDays: number;
  confidence: 'EVIDENCE_PAIR';
  ruleVersion: 'lead-reciprocity-v1';
  reviewStatus: 'PENDING';
};

/** Evidence pair, not a claim of free or paid placement; human review remains required. */
export function reciprocalPromotion(
  forward: PromotionEvidence,
  reverse: PromotionEvidence,
): ReciprocalEvidence | null {
  const validId = (value: string) => /^\d{1,20}$/.test(value);
  const a = Date.parse(forward.publishedAt),
    b = Date.parse(reverse.publishedAt);
  if (
    !forward.promotionVerified ||
    !reverse.promotionVerified ||
    forward.catalog ||
    reverse.catalog ||
    !validId(forward.sourceChannelId) ||
    !validId(forward.targetChannelId) ||
    forward.sourceChannelId === forward.targetChannelId ||
    forward.sourceChannelId !== reverse.targetChannelId ||
    forward.targetChannelId !== reverse.sourceChannelId ||
    !forward.postId ||
    !reverse.postId ||
    forward.postId === reverse.postId ||
    !forward.creativeHash ||
    !reverse.creativeHash ||
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    Math.abs(a - b) > 7 * 24 * 60 * 60 * 1000
  )
    return null;
  return {
    forwardPostId: forward.postId,
    reversePostId: reverse.postId,
    forwardAt: forward.publishedAt,
    reverseAt: reverse.publishedAt,
    windowDays: Math.abs(a - b) / (24 * 60 * 60 * 1000),
    confidence: 'EVIDENCE_PAIR',
    ruleVersion: 'lead-reciprocity-v1',
    reviewStatus: 'PENDING',
  };
}
