import type { PrismaService } from '../../../../prisma/prisma.service';
import type {
  CrmPackageSalesContext,
  CrmCopilotFact,
} from '@telegram-system/shared';
/** Current selected business metadata only; raw subscriber estimates are not verified audience promises. */
export async function leadPreparationChannelFacts(
  prisma: PrismaService,
  workspaceId: string,
  products: CrmPackageSalesContext['products'],
) {
  const ids = [...new Set(products.map((product) => product.channel.id))].slice(
    0,
    5,
  );
  const rows = ids.length
    ? await prisma.telegramChannel.findMany({
        where: {
          workspaceId,
          id: { in: ids },
          isActive: true,
          adminLinks: { some: {} },
        },
        select: {
          id: true,
          title: true,
          niche: true,
          shortDescription: true,
          language: true,
        },
        orderBy: { id: 'asc' },
        take: 5,
      })
    : [];
  const channels = rows.map((row) => ({
    ...row,
    title: row.title.slice(0, 300),
    niche: row.niche?.slice(0, 300) ?? null,
    shortDescription: row.shortDescription?.slice(0, 500) ?? null,
  }));
  const facts: CrmCopilotFact[] = channels.map((channel) => ({
    id: `channel:${channel.id}`,
    kind: 'PRODUCT',
    text: JSON.stringify({
      channel,
      provenance:
        'Current selected owned-channel metadata; audience statistics are not verified',
    }),
  }));
  return {
    channels,
    facts,
    verifiedThemes: channels.some(
      (channel) => channel.niche || channel.shortDescription,
    ),
  };
}
