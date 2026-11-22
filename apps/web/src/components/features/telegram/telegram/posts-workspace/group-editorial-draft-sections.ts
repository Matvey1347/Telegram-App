import type { TelegramManagedPostEditorialPair } from "@telegram-system/shared";
import type { PostSidebarSection } from "./telegram-post-workspace-model";

export function groupEditorialDraftSections(
  sections: PostSidebarSection[],
  pairs: TelegramManagedPostEditorialPair[] | undefined,
): PostSidebarSection[] {
  if (!pairs?.length) return sections;

  const byPost = new Map(pairs.map((pair) => [pair.postId, pair]));
  const groups = new Map<string, PostSidebarSection>();
  const remaining = [];

  for (const section of sections) {
    const [post] = section.posts;
    const pair = !section.group && post?.status === "DRAFT" && byPost.get(post.id);
    if (!pair || post.readOnlyTelegramPost) {
      remaining.push(section);
      continue;
    }

    const key = `editorial:${JSON.stringify([pair.sphereId, pair.rubricId])}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        group: null,
        editorial: { sphereName: pair.sphereName, rubricName: pair.rubricName, sphereIcon: pair.sphereIcon, rubricIcon: pair.rubricIcon },
        posts: [],
        pendingPosts: [],
      };
      groups.set(key, group);
    }
    group.posts.push(post);
  }

  return [
    ...[...groups.values()].sort((left, right) =>
      left.editorial!.sphereName.localeCompare(right.editorial!.sphereName) ||
      left.editorial!.rubricName.localeCompare(right.editorial!.rubricName),
    ),
    ...remaining,
  ];
}
