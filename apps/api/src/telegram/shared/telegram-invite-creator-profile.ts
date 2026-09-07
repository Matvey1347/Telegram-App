import type { PrismaService } from '../../prisma/prisma.service';

type InviteCreatorLink = {
  creatorTelegramUserId?: string | null;
  creatorUsername?: string | null;
  creatorFirstName?: string | null;
  creatorPhotoUrl?: string | null;
};

/** Reuses the connected MTProto profile when an invite row has incomplete creator data. */
export async function hydrateTelegramInviteCreatorProfiles<
  T extends InviteCreatorLink,
>(prisma: PrismaService, workspaceId: string, links: T[]): Promise<T[]> {
  const creatorIds = [
    ...new Set(
      links
        .map((link) => link.creatorTelegramUserId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const creatorUsernames = [
    ...new Set(
      links
        .map((link) => link.creatorUsername?.replace(/^@/, '').trim())
        .filter((username): username is string => Boolean(username)),
    ),
  ];
  if (!creatorIds.length && !creatorUsernames.length) return links;
  const accounts = await prisma.telegramUserAccountIntegration.findMany({
    where: {
      workspaceId,
      OR: [
        ...(creatorIds.length ? [{ telegramUserId: { in: creatorIds } }] : []),
        ...(creatorUsernames.length
          ? [
              {
                username: {
                  in: creatorUsernames,
                  mode: 'insensitive' as const,
                },
              },
            ]
          : []),
      ],
    },
    select: {
      telegramUserId: true,
      username: true,
      firstName: true,
      photoUrl: true,
    },
  });
  const byTelegramId = new Map(
    accounts
      .filter((account) => account.telegramUserId)
      .map((account) => [account.telegramUserId!, account]),
  );
  const byUsername = new Map(
    accounts
      .filter((account) => account.username)
      .map((account) => [
        account.username!.replace(/^@/, '').toLowerCase(),
        account,
      ]),
  );
  return links.map((link) => {
    const account =
      (link.creatorTelegramUserId
        ? byTelegramId.get(link.creatorTelegramUserId)
        : undefined) ||
      (link.creatorUsername
        ? byUsername.get(link.creatorUsername.replace(/^@/, '').toLowerCase())
        : undefined);
    if (!account) return link;
    return {
      ...link,
      creatorUsername: link.creatorUsername || account.username,
      creatorFirstName: link.creatorFirstName || account.firstName,
      creatorPhotoUrl: account.photoUrl || link.creatorPhotoUrl,
    };
  });
}
