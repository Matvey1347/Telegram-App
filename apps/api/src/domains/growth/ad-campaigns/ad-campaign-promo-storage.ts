import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export function isCampaignStorageMissing(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === 'P2021') return true;
  if (error.code !== 'P2010') return false;

  const originalCode =
    (
      error.meta as
        | {
            driverAdapterError?: {
              cause?: { originalCode?: string };
            };
          }
        | undefined
    )?.driverAdapterError?.cause?.originalCode ?? null;

  return originalCode === '42P01';
}

export class AdCampaignPromoStorage {
  private campaignPromoStorageState: 'unknown' | 'available' | 'missing' =
    'unknown';

  constructor(private readonly prisma: PrismaService) {}

  markMissing() {
    this.campaignPromoStorageState = 'missing';
  }

  async hasCampaignPromoStorage() {
    if (this.campaignPromoStorageState === 'available') return true;
    if (this.campaignPromoStorageState === 'missing') return false;

    try {
      await this.prisma.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "AdCampaignPromo" LIMIT 1`,
      );
      this.campaignPromoStorageState = 'available';
      return true;
    } catch (error) {
      if (!isCampaignStorageMissing(error)) throw error;
      this.campaignPromoStorageState = 'missing';
      return false;
    }
  }

  async replaceCampaignPromos(tx: any, campaignId: string, promoIds: string[]) {
    if (!(await this.hasCampaignPromoStorage())) return;
    await tx.adCampaignPromo.deleteMany({
      where: { adCampaignId: campaignId },
    });
    if (!promoIds.length) return;
    await tx.adCampaignPromo.createMany({
      data: promoIds.map((promoId) => ({
        adCampaignId: campaignId,
        promoId,
      })),
      skipDuplicates: true,
    });
  }
}
