import type { TelegramManagedPost } from "@/lib/api";

export function includeDeepLinkedManagedPost(
  pageItems: TelegramManagedPost[],
  deepLinkedPost?: TelegramManagedPost | null,
) {
  if (!deepLinkedPost || pageItems.some((post) => post.id === deepLinkedPost.id)) {
    return pageItems;
  }
  return [...pageItems, deepLinkedPost];
}
