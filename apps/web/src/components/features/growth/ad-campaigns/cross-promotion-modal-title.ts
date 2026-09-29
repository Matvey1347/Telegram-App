import type { CrossPromotionPlanKind } from "@telegram-system/shared";

export type CrossPromotionModalMode = "create" | "edit";

export function crossPromotionModalTitle(
  mode: CrossPromotionModalMode,
  kind: CrossPromotionPlanKind,
) {
  if (mode === "edit") return "Edit mutual promotion";
  return kind === "DIRECT_MUTUAL"
    ? "New direct mutual promotion"
    : "New own-channel promotion";
}
