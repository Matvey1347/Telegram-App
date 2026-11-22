import type { PromotionKind } from "./cross-promotion-create-steps";

export function promotionDraftNamespace(kind: PromotionKind) {
  return kind === "FOLDER" ? "mutual-promotion-folder:draft" : `ads:cross-promotion:${kind}:draft`;
}
