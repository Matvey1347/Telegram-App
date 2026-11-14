import type { Prisma } from '@prisma/client';

/** Retries retain per-post ownership and must respect VP cancellation/end time. */
export function managedPostDeliveryEligibility(
  now: Date,
): Prisma.TelegramManagedPostWhereInput {
  return {
    OR: [
      { mutualPromotionDelivery: { is: null } },
      {
        mutualPromotionDelivery: {
          is: {
            folderPost: {
              folder: {
                endsAt: { gt: now },
                status: { notIn: ['CANCELLED', 'DELETING', 'COMPLETED'] },
              },
            },
          },
        },
      },
    ],
  };
}
