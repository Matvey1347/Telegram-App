import { Prisma, TelegramAdvertiserContactType } from '@prisma/client';

type AdvertiserIdentityInput = {
  workspaceId: string;
  username: string | null;
  phone: string | null;
  email: string | null;
  displayName: string | null | undefined;
};

type AdvertiserFinder = Pick<
  Prisma.TransactionClient['telegramAdvertiser'],
  'findFirst'
>;

/**
 * Resolves the one CRM card that should own a customer's sales and Telegram
 * history. Strong identity values win; a normalized name is a safe fallback
 * when an import has no handle or other contact detail.
 */
export function findCanonicalAdvertiser(
  advertiser: AdvertiserFinder,
  input: AdvertiserIdentityInput,
) {
  const displayName = input.displayName?.trim();
  const identities: Prisma.TelegramAdvertiserWhereInput[] = [
    ...(input.username
      ? [
          {
            telegramUsername: {
              equals: input.username,
              mode: 'insensitive' as const,
            },
          },
          {
            contacts: {
              some: {
                type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
                normalizedValue: input.username,
              },
            },
          },
        ]
      : []),
    ...(input.phone
      ? [
          { phone: input.phone },
          {
            contacts: {
              some: {
                type: TelegramAdvertiserContactType.PHONE,
                normalizedValue: input.phone,
              },
            },
          },
        ]
      : []),
    ...(input.email
      ? [
          { email: { equals: input.email, mode: 'insensitive' as const } },
          {
            contacts: {
              some: {
                type: TelegramAdvertiserContactType.EMAIL,
                normalizedValue: input.email,
              },
            },
          },
        ]
      : []),
    ...(displayName && displayName.toLowerCase() !== 'advertiser'
      ? [
          {
            displayName: {
              equals: displayName,
              mode: 'insensitive' as const,
            },
          },
        ]
      : []),
  ];
  if (!identities.length) return null;
  return advertiser.findFirst({
    where: { workspaceId: input.workspaceId, OR: identities },
    select: { id: true },
    orderBy: [
      { totalSalesCount: 'desc' },
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
  });
}
