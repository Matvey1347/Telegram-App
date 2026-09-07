import type {
  MutualPromotionFolderDetail,
  MutualPromotionParticipantRole,
} from "@telegram-system/shared";
import { resolveTitleTemplate } from "@telegram-system/shared";
import {
  channelLocalDateKey,
  channelLocalTime,
  zonedDateTimeToUtc,
} from "@/lib/features/growth/telegram-ad-sales";

export type ParticipantDraft = {
  channelId: string;
  role: MutualPromotionParticipantRole;
  inviteLinkId: string;
  inviteLinkMode: "FOLDER_ONLY" | "REUSABLE";
  accountId: string;
  amount: string;
};

export type FolderDraft = {
  title: string;
  startsDate: string;
  startsTime: string;
  endsDate: string;
  endsTime: string;
  notes: string;
  participants: ParticipantDraft[];
};

export function folderDraftTitleValues(draft: FolderDraft) {
  const dateRange =
    draft.startsDate && draft.endsDate
      ? `${draft.startsDate} — ${draft.endsDate}`
      : draft.startsDate || draft.endsDate || "";
  return { "date-range": dateRange };
}

export function resolveFolderDraftTitle(draft: FolderDraft) {
  return resolveTitleTemplate(draft.title, folderDraftTitleValues(draft));
}

export function emptyFolderDraft(timezone: string): FolderDraft {
  const start = new Date(Date.now() + 60 * 60_000);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60_000);
  return {
    title: "",
    startsDate: channelLocalDateKey(start, timezone),
    startsTime: channelLocalTime(start, timezone),
    endsDate: channelLocalDateKey(end, timezone),
    endsTime: channelLocalTime(end, timezone),
    notes: "",
    participants: [],
  };
}

export function folderDetailToDraft(
  folder: MutualPromotionFolderDetail,
  timezone: string,
): FolderDraft {
  return {
    title: folder.titleTemplate ?? folder.title,
    startsDate: channelLocalDateKey(folder.startsAt, timezone),
    startsTime: channelLocalTime(folder.startsAt, timezone),
    endsDate: channelLocalDateKey(folder.endsAt, timezone),
    endsTime: channelLocalTime(folder.endsAt, timezone),
    notes: folder.notes ?? "",
    participants: folder.participants.map((participant) => ({
      channelId: participant.telegramChannelId,
      role: participant.role,
      inviteLinkId: participant.inviteLink.id,
      inviteLinkMode: participant.inviteLinkMode,
      accountId: participant.expense?.accountId ?? "",
      amount: participant.expense ? String(participant.expense.amount) : "",
    })),
  };
}

export function folderDraftInstants(draft: FolderDraft, timezone: string) {
  const startsAtDate = zonedDateTimeToUtc(
    draft.startsDate,
    draft.startsTime,
    timezone,
  );
  const endsAtDate = zonedDateTimeToUtc(
    draft.endsDate,
    draft.endsTime,
    timezone,
  );
  return {
    startsAt: Number.isNaN(startsAtDate.getTime())
      ? ""
      : startsAtDate.toISOString(),
    endsAt: Number.isNaN(endsAtDate.getTime()) ? "" : endsAtDate.toISOString(),
  };
}
