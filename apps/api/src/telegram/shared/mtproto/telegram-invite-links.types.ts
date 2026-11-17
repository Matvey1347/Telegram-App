export type TelegramInviteLinksResult = {
  scope: 'ALL_ADMINS' | 'PARTIAL_ADMINS';
  /** Authoritative channel-wide queue; null/absent means not verified. */
  pendingJoinRequestsCount?: number | null;
  expectedTotalLinks: number;
  admins: Array<{
    telegramUserId: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    activeLinksCount: number;
    revokedLinksCount: number;
  }>;
  links: Array<{
    url: string;
    title: string | null;
    telegramCreatorUserId: string;
    creatorUsername: string | null;
    creatorFirstName: string | null;
    creatorLastName: string | null;
    creatorPhotoUrl: string | null;
    createdAt: Date | null;
    startDate: Date | null;
    expireDate: Date | null;
    usageLimit: number | null;
    usage: number;
    requested: number;
    requestNeeded: boolean;
    permanent: boolean;
    revoked: boolean;
    joinedWithinPeriod?: number | null;
    pendingWithinPeriod?: number | null;
  }>;
  warnings: string[];
};
