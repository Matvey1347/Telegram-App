import type { CrossPromotionPlanKind } from "@telegram-system/shared";

export type CrossPromotionModalMode = "create" | "copy" | "edit";

export function crossPromotionModalTitle(
  mode: CrossPromotionModalMode,
  kind: CrossPromotionPlanKind,
) {
  if (mode === "edit") return "Edit mutual promotion";
  if (mode === "copy") return "Copy promotion placement";
  return kind === "DIRECT_MUTUAL"
    ? "New direct mutual promotion"
    : "New own-channel promotion";
}
