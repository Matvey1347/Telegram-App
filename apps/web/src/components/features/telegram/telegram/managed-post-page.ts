import type { TelegramManagedPost } from "@/lib/api";
import { useMemo } from "react";

const EMPTY_MANAGED_POSTS: TelegramManagedPost[] = [];

export function includeDeepLinkedManagedPost(
  pageItems: TelegramManagedPost[] | undefined,
  deepLinkedPost?: TelegramManagedPost | null,
) {
  const resolvedPageItems = pageItems ?? EMPTY_MANAGED_POSTS;
  if (
    !deepLinkedPost ||
    resolvedPageItems.some((post) => post.id === deepLinkedPost.id)
  ) {
    return resolvedPageItems;
  }
  return [...resolvedPageItems, deepLinkedPost];
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
