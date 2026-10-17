import type { Prisma } from '@prisma/client';

export function normalizeFinanceMerchant(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

export async function writeFinanceMerchantMapping(
  tx: Prisma.TransactionClient,
  profileId: string,
  merchant: string | null,
  categoryId: string | null,
) {
  if (!merchant || !categoryId) return;
  const merchantNormalized = normalizeFinanceMerchant(merchant);
  await tx.financeMerchantMapping.upsert({
    where: {
      profileId_merchantNormalized: { profileId, merchantNormalized },
    },
    update: { categoryId },
    create: { profileId, merchantNormalized, categoryId },
  });
}
