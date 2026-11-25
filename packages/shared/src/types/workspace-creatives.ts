import type { TelegramSystemBotPostDraft } from "./telegram-system-bot";

export type WorkspaceCreativePost = Omit<
  TelegramSystemBotPostDraft,
  "title" | "formattedHtml"
>;

export const creativeSections = ["good", "bad", "attempt", "mentor"] as const;
export const creativeTargets = ["externalProduct", "channel"] as const;
export const creativeFileTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
] as const;
export const creativeFileSizeLimit = 10 * 1024 * 1024;

export type CreativeSection = (typeof creativeSections)[number];
export type CreativeTarget = (typeof creativeTargets)[number];
export type CreativeFileType = (typeof creativeFileTypes)[number];

export interface CreativeComment {
  id: string;
  text: string;
}

export interface WorkspaceCreative {
  id: string;
  section: CreativeSection;
  target: CreativeTarget | null;
  title: string;
  text: string;
  sourceUrl: string | null;
  post?: WorkspaceCreativePost;
  attachment: { name: string; mimeType: string } | null;
  comments: CreativeComment[];
}

export interface WorkspaceCreativePage {
  items: WorkspaceCreative[];
  nextCursor: string | null;
}

export interface CreateWorkspaceCreative {
  section: CreativeSection;
  target?: CreativeTarget;
  title: string;
  text?: string;
  post?: WorkspaceCreativePost;
  sourceUrl?: string;
  mentorComment?: string;
}
