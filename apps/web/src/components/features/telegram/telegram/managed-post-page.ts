import type { TelegramManagedPost } from "@/lib/api";
import { useMemo } from "react";

const EMPTY_MANAGED_POSTS: TelegramManagedPost[] = [];

export function includeDeepLinkedManagedPost(
  pageItems: TelegramManagedPost[] | undefined,
  deepLinkedPost?: TelegramManagedPost | null,
) {
  const resolvedPageItems = pageItems ?? EMPTY_MANAGED_POSTS;
  if (!deepLinkedPost) return resolvedPageItems;
  const alreadyListed = resolvedPageItems.some(
    (post) => post.id === deepLinkedPost.id,
  );
  // A deep link refetches the edited post so a schedule changed from Selling
  // replaces its stale list-cache copy instead of being discarded.
  return alreadyListed
    ? resolvedPageItems.map((post) =>
        post.id === deepLinkedPost.id ? deepLinkedPost : post,
      )
    : [...resolvedPageItems, deepLinkedPost];
}

export function useManagedPostPageItems(
  pageItems: TelegramManagedPost[] | undefined,
  deepLinkedPost?: TelegramManagedPost | null,
) {
  return useMemo(
    () => includeDeepLinkedManagedPost(pageItems, deepLinkedPost),
    [deepLinkedPost, pageItems],
  );
}
