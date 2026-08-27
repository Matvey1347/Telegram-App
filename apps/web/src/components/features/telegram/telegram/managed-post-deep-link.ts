export type ManagedPostStatusTab = "PUBLISHED" | "SCHEDULED" | "DRAFT";

export function managedPostStatusTab(
  status: string,
  brokenPublished = false,
): ManagedPostStatusTab {
  if (status === "PUBLISHED" && !brokenPublished) return "PUBLISHED";
  if (status === "SCHEDULED") return "SCHEDULED";
  return "DRAFT";
}

export function expandDeepLinkedPostGroup(
  collapsedGroupIds: string[] | null,
  allGroupIds: string[],
  postGroupId: string | null,
) {
  if (!postGroupId) return collapsedGroupIds;
  return (collapsedGroupIds ?? allGroupIds).filter(
    (groupId) => groupId !== postGroupId,
  );
}
