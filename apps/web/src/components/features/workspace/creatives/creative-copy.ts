import type {
  CreativeSection,
  CreativeTarget,
  WorkspaceCreative,
} from "@telegram-system/shared";
import { creativeSections } from "@telegram-system/shared";
import { creativeLink } from "@/lib/features/workspace/creative-link";
import { workspaceCreativesApi } from "@/lib/features/workspace/workspace-creatives-api";

export type CreativeCopyLabels = {
  title: string;
  sections: Record<CreativeSection, string>;
  targets: Record<CreativeTarget, string>;
  attachment: string;
  comments: string;
  empty: string;
  emptyAdvice: string;
};

export function formatCreative(
  creative: WorkspaceCreative,
  labels: CreativeCopyLabels,
  origin: string,
  workspaceId: string,
) {
  return [
    `### ${creative.title}`,
    creative.target && labels.targets[creative.target],
    creative.text,
    ...(creative.post?.mediaItems?.map(({ url }) => url) ?? []),
    ...(creative.post?.buttonRows.flat().map(({ text, url }) => `[${text}](${url})`) ?? []),
    creative.attachment &&
      `${labels.attachment} — ${creative.attachment.name}\n${creativeLink(origin, workspaceId, creative.id)}`,
    creative.comments.length &&
      [
        labels.comments,
        ...creative.comments.map(
          (comment, index) =>
            `${index + 1}. ${comment.text.replaceAll("\n", "\n   ")}`,
        ),
      ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function loadCreativeEncyclopediaText(
  workspaceId: string,
  labels: CreativeCopyLabels,
  origin: string,
  signal: AbortSignal,
) {
  const sections = await Promise.all(
    creativeSections.map(async (section) => {
      const entries: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await workspaceCreativesApi.list(
          workspaceId,
          section,
          cursor,
          signal,
        );
        entries.push(
          ...page.items.map((item) =>
            formatCreative(item, labels, origin, workspaceId),
          ),
        );
        cursor = page.nextCursor;
      } while (cursor);
      return [
        `## ${labels.sections[section]}`,
        ...(entries.length ? entries : [section === "mentor" ? labels.emptyAdvice : labels.empty]),
      ].join("\n\n");
    }),
  );
  return [`# ${labels.title}`, ...sections].join("\n\n");
}
