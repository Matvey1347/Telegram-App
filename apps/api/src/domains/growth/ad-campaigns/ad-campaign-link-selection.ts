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
    data: { adCampaignId: null, lastSyncedAt: new Date() },
  });
  if (!inviteLinkIds.length) return;
  await tx.telegramInviteLink.updateMany({
    where: { workspaceId, id: { in: inviteLinkIds } },
    data: { adCampaignId: campaignId, lastSyncedAt: new Date() },
  });
}

export async function replaceCampaignTrackingInviteLinks(
  tx: any,
  workspaceId: string,
  campaignId: string,
  inviteLinkIds: string[],
  kind = 'BOT',
) {
  const links = inviteLinkIds.length
    ? await tx.telegramInviteLink.findMany({
        where: {
          workspaceId,
          id: { in: inviteLinkIds },
          telegramChannel: { adminLinks: { some: {} } },
        },
        select: { id: true, joinedCount: true, requestedCount: true },
      })
    : [];
  if (links.length !== inviteLinkIds.length) {
    throw new BadRequestException(
      'Tracking links must belong to an owned channel',
    );
  }
  const existing = await tx.adCampaignBotInviteLink.findMany({
    where: { adCampaignId: campaignId },
    select: {
      inviteLinkId: true,
      baselineJoinedCount: true,
      baselineRequestedCount: true,
    },
  });
  const baselineByLink = new Map<
    string,
    { baselineJoinedCount: number; baselineRequestedCount: number }
  >(existing.map((link: any) => [link.inviteLinkId, link]));
  await tx.adCampaignBotInviteLink.deleteMany({
    where: { adCampaignId: campaignId },
  });
  if (links.length) {
    await tx.adCampaignBotInviteLink.createMany({
      data: links.map(
        (link: { id: string; joinedCount: number; requestedCount: number }) => {
          const baseline = baselineByLink.get(link.id);
          return {
            adCampaignId: campaignId,
            inviteLinkId: link.id,
            kind,
            baselineJoinedCount:
              baseline?.baselineJoinedCount ?? link.joinedCount,
            baselineRequestedCount:
              baseline?.baselineRequestedCount ?? link.requestedCount,
          };
        },
      ),
      skipDuplicates: true,
    });
  }
}

function trackingInviteLinkIds(channel: any, kind: string) {
  const ids = {
    MAIN: [channel.defaultInviteLinkId],
    PUBLIC: [channel.publicInviteLinkId],
    VP: channel.mutualPromotionInviteLinkIds,
    BOT: [channel.botInviteLinkId],
    TRANSFER: [channel.audienceTransferInviteLinkId],
    NEWSLETTER: [channel.broadcastInviteLinkId],
    FOLDERS: channel.folderDefaultInviteLinkIds,
  }[kind];
  if (!ids) throw new BadRequestException('Unknown system link kind');
  return normalizeSelectionIds(ids);
}

export async function resolveTrackingInviteLinks(
  tx: any,
  workspaceId: string,
  channelIds: string[],
  kind: string,
  excludedChannelId?: string,
) {
  const ids = normalizeSelectionIds(channelIds);
  if (!ids.length) return [];
  if (excludedChannelId && ids.includes(excludedChannelId)) {
    throw new BadRequestException(
      'The campaign channel cannot be a cross-channel destination',
    );
  }
  const channels = await tx.telegramChannel.findMany({
    where: {
      workspaceId,
      id: { in: ids },
      isActive: true,
      archivedAt: null,
      adminLinks: { some: {} },
    },
    select: {
      id: true,
      defaultInviteLinkId: true,
      publicInviteLinkId: true,
      botInviteLinkId: true,
      broadcastInviteLinkId: true,
      audienceTransferInviteLinkId: true,
      folderDefaultInviteLinkIds: true,
      mutualPromotionInviteLinkIds: true,
    },
  });
  if (channels.length !== ids.length) {
    throw new BadRequestException(
      'Destination channels must be owned active channels',
    );
  }
  const inviteLinkIds = channels.flatMap((channel: any) =>
    trackingInviteLinkIds(channel, kind),
  );
  if (!inviteLinkIds.length || inviteLinkIds.length < channels.length) {
    throw new BadRequestException(
      'Every destination channel must have the selected system link',
    );
  }
  return normalizeSelectionIds(inviteLinkIds);
}

export async function trackingInviteLinks(
  prisma: PrismaService,
  workspaceId: string,
) {
  const channels = await prisma.telegramChannel.findMany({
    where: {
      workspaceId,
      isActive: true,
      archivedAt: null,
      adminLinks: { some: {} },
    },
    select: {
      id: true,
      title: true,
      photoUrl: true,
      defaultInviteLinkId: true,
      publicInviteLinkId: true,
      botInviteLinkId: true,
      broadcastInviteLinkId: true,
      audienceTransferInviteLinkId: true,
      folderDefaultInviteLinkIds: true,
      mutualPromotionInviteLinkIds: true,
    },
    orderBy: { title: 'asc' },
  });
  const definitions = [
    ['MAIN', 'Main', 'Default'],
    ['PUBLIC', 'Public', 'Public'],
    ['VP', 'VP', 'VP'],
    ['BOT', 'Bot', 'Bot'],
    ['TRANSFER', 'Transfer', 'Transfer'],
    ['NEWSLETTER', 'Newsletter', 'Newsletter'],
    ['FOLDERS', 'Folders', 'Folders'],
  ] as const;
  return {
    kinds: definitions
      .map(([kind, label, tag]) => ({
        kind,
        label,
        tag,
        channels: channels
          .filter((channel) => trackingInviteLinkIds(channel, kind).length > 0)
          .map((channel) => ({
            id: channel.id,
            title: channel.title,
            photoUrl: channel.photoUrl,
          })),
      }))
      .filter((kind) => kind.channels.length),
  };
}
