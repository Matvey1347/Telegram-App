import { Prisma } from '@prisma/client';
import type {
  CrmAccountSummary,
  CrmMemberSummary,
  CrmMessagePreview,
  CrmPeerSummary,
} from '@telegram-system/shared';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';

export const crmAccountSummarySelect = {
  id: true,
  label: true,
  username: true,
  photoUrl: true,
} satisfies Prisma.TelegramUserAccountIntegrationSelect;

export const crmMemberSummarySelect = {
  id: true,
  avatarIcon: {
    select: {
      id: true,
      type: true,
      name: true,
      emoji: true,
      imageUrl: true,
    },
  },
  user: { select: { name: true, email: true } },
} satisfies Prisma.WorkspaceMemberSelect;

export const crmPeerSummarySelect = {
  id: true,
  telegramUserId: true,
  username: true,
  firstName: true,
  lastName: true,
  photoUrl: true,
} satisfies Prisma.TelegramCrmPeerSelect;

export const crmMessagePreviewSelect = {
  id: true,
  conversationId: true,
  direction: true,
  origin: true,
  text: true,
  sentAt: true,
  readState: true,
} satisfies Prisma.TelegramCrmMessageSelect;

type AccountSummaryRow = Prisma.TelegramUserAccountIntegrationGetPayload<{
  select: typeof crmAccountSummarySelect;
}>;
type MemberSummaryRow = Prisma.WorkspaceMemberGetPayload<{
  select: typeof crmMemberSummarySelect;
}>;
type PeerSummaryRow = Prisma.TelegramCrmPeerGetPayload<{
  select: typeof crmPeerSummarySelect;
}>;
type MessagePreviewRow = Prisma.TelegramCrmMessageGetPayload<{
  select: typeof crmMessagePreviewSelect;
}>;

export const mapCrmAccountSummary = (
  row: AccountSummaryRow,
): CrmAccountSummary => row;

export const mapCrmMemberSummary = (
  row: MemberSummaryRow | null,
): CrmMemberSummary | null =>
  row
    ? {
        id: row.id,
        name: row.user.name,
        email: row.user.email ?? null,
        avatarPresentation: iconToResolvedEmoji(row.avatarIcon),
      }
    : null;

export const mapCrmPeerSummary = (row: PeerSummaryRow): CrmPeerSummary => row;

export const mapCrmMessagePreview = (
  row: MessagePreviewRow | null | undefined,
): CrmMessagePreview | null =>
  row ? { ...row, sentAt: row.sentAt.toISOString() } : null;
