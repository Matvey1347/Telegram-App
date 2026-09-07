import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { acquirePostgresTransactionLock } from '../../prisma/postgres-advisory-lock';

@Injectable()
export class GrowthInviteLinkReservationService {
  async assertAvailableForAds(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    inviteLinkIds: string[],
    telegramChannelId: string,
    currentCampaignId?: string,
  ) {
    if (!inviteLinkIds.length) return;
    for (const inviteLinkId of [...inviteLinkIds].sort()) {
      await acquirePostgresTransactionLock(tx, inviteLinkId);
    }
    const links = await tx.telegramInviteLink.findMany({
      where: { id: { in: inviteLinkIds }, workspaceId, telegramChannelId },
      select: {
        id: true,
        adCampaignId: true,
        mutualPromotionParticipants: { take: 1, select: { id: true } },
      },
    });
    if (links.length !== inviteLinkIds.length) {
      throw new BadRequestException(
        'One or more invite links do not belong to selected Telegram channel',
      );
    }
    if (
      links.some(
        (link) => link.adCampaignId && link.adCampaignId !== currentCampaignId,
      )
    ) {
      throw new BadRequestException(
        'One or more invite links are already linked to another campaign',
      );
    }
    if (links.some((link) => link.mutualPromotionParticipants.length > 0)) {
      throw new BadRequestException(
        'Invite links reserved by mutual-promotion folders cannot be used by Ads',
      );
    }
  }
}
