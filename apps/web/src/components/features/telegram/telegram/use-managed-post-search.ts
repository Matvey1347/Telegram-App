import { useState } from "react";
import type { TelegramManagedPost } from "@/lib/api";

function searchableText(value: string | null | undefined) {
  return value?.toLocaleLowerCase().trim() ?? "";
}

export function matchesManagedPostSearch(
  post: TelegramManagedPost,
  query: string,
  context?: { groupTitle?: string | null; memberName?: string | null },
) {
  const terms = searchableText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = [
    post.title,
    post.text,
    post.formattedText,
    post.telegramMessageIds.join(" "),
    context?.groupTitle,
    context?.memberName,
  ]
    .map(searchableText)
    .join("\n");
  return terms.every((term) => haystack.includes(term));
}

export function useManagedPostSearch<
  TPending extends { title: string },
>(options: {
  posts: TelegramManagedPost[];
  pendingPosts: TPending[];
  status: TelegramManagedPost["status"];
  savingPostIds: string[];
  isBrokenPublishedPost: (post: TelegramManagedPost) => boolean;
  groupTitle: (post: TelegramManagedPost) => string | null | undefined;
  memberName: (post: TelegramManagedPost) => string | null | undefined;
}) {
  const [query, setQuery] = useState("");
  const matchesStatus = (post: TelegramManagedPost) =>
    options.savingPostIds.includes(post.id) ||
    (options.status === "DRAFT"
      ? ["DRAFT", "FAILED", "PUBLISHING"].includes(post.status) ||
        options.isBrokenPublishedPost(post)
      : options.status === "PUBLISHED"
        ? post.status === "PUBLISHED" && !options.isBrokenPublishedPost(post)
        : post.status === options.status);
  const visiblePosts = options.posts.filter(
    (post) =>
      matchesStatus(post) &&
      matchesManagedPostSearch(post, query, {
        groupTitle: options.groupTitle(post),
        memberName: options.memberName(post),
      }),
  );
  const terms = searchableText(query).split(/\s+/).filter(Boolean);
  const visiblePendingPosts = options.pendingPosts.filter((post) => {
    const title = searchableText(post.title);
    return terms.every((term) => title.includes(term));
  });
  return { query, setQuery, visiblePosts, visiblePendingPosts };
}
