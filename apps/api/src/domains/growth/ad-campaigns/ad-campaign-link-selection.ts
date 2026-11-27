import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeSelectionIds } from './ad-campaign-advertising-sources';

export function selectedPromoIds(dto: {
  promoId?: string | null;
  promoIds?: string[] | null;
}) {
  return normalizeSelectionIds([...(dto.promoIds || []), dto.promoId]);
}

export function selectedInviteLinkIds(dto: {
  telegramInviteLinkId?: string | null;
  inviteLinkIds?: string[] | null;
}) {
  return normalizeSelectionIds([
    ...(dto.inviteLinkIds || []),
    dto.telegramInviteLinkId,
  ]);
}

export async function ensurePromosBelongToChannel(
  prisma: PrismaService,
  workspaceId: string,
  promoIds: string[],
  channelId: string,
) {
  if (!promoIds.length) return;
  const promos = await prisma.promo.findMany({
    where: {
      id: { in: promoIds },
      workspaceId,
      telegramChannelId: channelId,
    },
    select: { id: true },
  });
  if (promos.length !== promoIds.length) {
    throw new BadRequestException(
      'One or more promos do not belong to selected Telegram channel',
    );
  }
}

export async function replaceCampaignInviteLinks(
  tx: any,
  workspaceId: string,
  campaignId: string,
  inviteLinkIds: string[],
) {
  await tx.telegramInviteLink.updateMany({
    where: {
      workspaceId,
      adCampaignId: campaignId,
      id: { notIn: inviteLinkIds.length ? inviteLinkIds : [''] },
    },
    data: { adCampaignId: null },
  });
  if (!inviteLinkIds.length) return;
  await tx.telegramInviteLink.updateMany({
    where: { workspaceId, id: { in: inviteLinkIds } },
    data: { adCampaignId: campaignId },
  });
}
