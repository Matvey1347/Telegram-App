import type { Prisma } from '@prisma/client';

export type TelegramChannelFinancialPreviewInput = {
  id: string;
  purchaseTransactionId?: string | null;
  currentSubscribersCount?: number | null;
  activeSubscribersWindow?: number | null;
  targetCpaFrom?: Prisma.Decimal | number | null;
  targetCpa?: Prisma.Decimal | number | null;
  acceptableCpaFrom?: Prisma.Decimal | number | null;
  acceptableCpa?: Prisma.Decimal | number | null;
  stopCpaFrom?: Prisma.Decimal | number | null;
  stopCpa?: Prisma.Decimal | number | null;
  kpiCurrency?: string | null;
  ownViewsPerPost?: number | null;
  adBaseCpm?: Prisma.Decimal | number | null;
  adBaseCurrency?: string | null;
  audienceSnapshots?: Array<{
    activeSubscribersEstimate?: number | null;
    viewRate?: Prisma.Decimal | number | null;
    dataQuality?: string | null;
    dataQualityReason?: string | null;
    hasExternalTrafficAnomaly?: boolean | null;
    hasSubscriberBasePollution?: boolean | null;
  }>;
};
