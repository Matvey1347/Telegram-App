import type {
  TelegramPostPlannerAssignment,
  TelegramPostPlannerPreviewResult,
} from "@telegram-system/shared";

type PlanPost = { id: string; title: string; groupId?: string | null };

export function parseCalendarPlanImport(
  content: string,
  posts: PlanPost[],
  timezone: string,
  now = new Date(),
): TelegramPostPlannerPreviewResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Plan must be valid JSON.");
  }
  const source = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { items?: unknown }).items)
      ? (parsed as { items: unknown[] }).items
      : null;
  if (!source?.length) {
    throw new Error(
      'Use a non-empty JSON array or an object with an "items" array.',
    );
  }
  if (source.length > 100)
    throw new Error("A plan can contain up to 100 posts.");
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const usedPosts = new Set<string>();
  const usedTimes = new Set<string>();
  const assignments = source.map(
    (value, index): TelegramPostPlannerAssignment => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`Plan item ${index + 1} must be an object.`);
      }
      const row = value as Record<string, unknown>;
      const postId = typeof row.postId === "string" ? row.postId.trim() : "";
      const post = postsById.get(postId);
      if (!post)
        throw new Error(
          `Post ${postId || index + 1} is not available for scheduling.`,
        );
      if (usedPosts.has(postId))
        throw new Error(`Post ${postId} is used more than once.`);
      const scheduledAt = importedScheduledAt(row);
      if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) {
        throw new Error(
          `Plan item ${index + 1} requires scheduledAt or date and time.`,
        );
      }
      const normalizedTime = new Date(scheduledAt).toISOString();
      if (new Date(normalizedTime).getTime() <= now.getTime()) {
        throw new Error(
          `Plan item ${index + 1} must be scheduled in the future.`,
        );
      }
      if (usedTimes.has(normalizedTime)) {
        throw new Error(`More than one post uses ${normalizedTime}.`);
      }
      usedPosts.add(postId);
      usedTimes.add(normalizedTime);
      const date =
        typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date)
          ? row.date
          : localDateKey(new Date(normalizedTime));
      return {
        postId,
        title: post.title,
        scheduledAt: normalizedTime,
        date,
        slotId: `import:${index}`,
        formatId: null,
        groupId: post.groupId ?? null,
        provenance: {
          planner: "telegram_posts_auto_calendar",
          reason: "imported_json_plan",
          slotId: `import:${index}`,
          formatId: null,
          groupId: post.groupId ?? null,
          generatedAt: now.toISOString(),
        },
      };
    },
  );
  assignments.sort(
    (left, right) =>
      new Date(left.scheduledAt).getTime() -
      new Date(right.scheduledAt).getTime(),
  );
  const dates = assignments.map((assignment) => assignment.date).sort();
  return {
    from: dates[0],
    to: dates.at(-1) || dates[0],
    timezone,
    assignments,
    summary: {
      eligiblePosts: posts.length,
      availableSlots: assignments.length,
      plannedPosts: assignments.length,
      unfilledSlots: 0,
    },
  };
}

export function serializeCalendarPlanImport(
  preview: TelegramPostPlannerPreviewResult,
) {
  return JSON.stringify(
    {
      items: preview.assignments.map((assignment) => ({
        postId: assignment.postId,
        scheduledAt: assignment.scheduledAt,
      })),
    },
    null,
    2,
  );
}

function importedScheduledAt(row: Record<string, unknown>) {
  if (typeof row.scheduledAt === "string" && row.scheduledAt.trim()) {
    return row.scheduledAt.trim();
  }
  if (typeof row.date !== "string" || typeof row.time !== "string") return "";
  return `${row.date.trim()}T${row.time.trim()}:00`;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
