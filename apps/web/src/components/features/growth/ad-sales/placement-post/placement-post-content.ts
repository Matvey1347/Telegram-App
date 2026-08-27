import type { PlacementManagedPostDraft } from "./placement-post-composer";

export function hasPlacementPostContent(
  draft?: PlacementManagedPostDraft | null,
) {
  if (!draft) return false;
  const hasText =
    typeof draft.text === "string" && draft.text.trim().length > 0;
  const hasImage =
    Array.isArray(draft.imageUrls) &&
    draft.imageUrls.some(
      (imageUrl) => typeof imageUrl === "string" && imageUrl.trim().length > 0,
    );
  return hasText || hasImage;
}
