import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { Prisma } from '@prisma/client';
import type { AdCampaignTrackingScope } from '@telegram-system/shared';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizeSelectionIds } from './ad-campaign-advertising-sources';

const trackingDefinitions = [
    ['MAIN', 'Main', 'Default'],
    ['PUBLIC', 'Public', 'Public'],
    ['VP', 'VP', 'VP'],
    ['BOT', 'Bot', 'Bot'],
    ['TRANSFER', 'Transfer', 'Transfer'],
    ['NEWSLETTER', 'Newsletter', 'Newsletter'],
    ['FOLDERS', 'Folders', 'Folders'],
  ] as const;

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
      kind: true,
      baselineJoinedCount: true,
      baselineRequestedCount: true,
    },
  });
  const existingIds = new Set(existing.map((row: { inviteLinkId: string }) => row.inviteLinkId));
  const nextIds = new Set(links.map((link: { id: string }) => link.id));
  const removedIds = existing.filter((row: { inviteLinkId: string }) => !nextIds.has(row.inviteLinkId))
    .map((row: { inviteLinkId: string }) => row.inviteLinkId);
  if (removedIds.length) await tx.adCampaignBotInviteLink.deleteMany({
    where: { adCampaignId: campaignId, inviteLinkId: { in: removedIds } },
  });
  const newLinks = links.filter((link: { id: string }) => !existingIds.has(link.id));
  if (newLinks.length) {
    await tx.adCampaignBotInviteLink.createMany({
      data: newLinks.map((link: { id: string; joinedCount: number; requestedCount: number }) => ({
        adCampaignId: campaignId, inviteLinkId: link.id, kind,
        baselineJoinedCount: link.joinedCount, baselineRequestedCount: link.requestedCount,
      })),
      skipDuplicates: true,
    });
  }
  const changedKind = existing.filter((row: { inviteLinkId: string; kind: string }) => nextIds.has(row.inviteLinkId) && row.kind !== kind)
    .map((row: { inviteLinkId: string }) => row.inviteLinkId);
  if (changedKind.length) await tx.adCampaignBotInviteLink.updateMany({
    where: { adCampaignId: campaignId, inviteLinkId: { in: changedKind } }, data: { kind },
  });
}

export function trackingInviteLinkIds(channel: any, kind: string) {
  const ids = {
    MAIN: [channel.defaultInviteLinkId],
    PUBLIC: [channel.publicInviteLinkId],
    VP: channel.mutualPromotionInviteLinkIds,
    BOT: [channel.botInviteLinkId],
    TRANSFER: [channel.audienceTransferInviteLinkId],
    NEWSLETTER: [channel.broadcastInviteLinkId],
    FOLDERS: channel.folderDefaultInviteLinkIds,
  }[kind];
  if (!Array.isArray(ids)) throw new BadRequestException('Unknown system link kind');
  return normalizeSelectionIds(ids);
}

export async function resolveTrackingInviteLinks(
  tx: any,
  workspaceId: string,
  channelIds: string[] | null,
  kind: string,
  excludedChannelId?: string,
  includeUnconfigured = false,
) {
  const ids = channelIds === null ? null : normalizeSelectionIds(channelIds);
  if (ids?.length === 0) return [];
  if (excludedChannelId && ids?.includes(excludedChannelId)) {
    throw new BadRequestException(
      'The campaign channel cannot be a cross-channel destination',
    );
  }
  const channels = await tx.telegramChannel.findMany({
    where: {
      workspaceId,
      ...(ids ? { id: { in: ids } } : excludedChannelId ? { id: { not: excludedChannelId } } : {}),
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
  if (ids && channels.length !== ids.length) {
    throw new BadRequestException(
      'Destination channels must be owned active channels',
    );
  }
  const inviteLinkIds = channels.flatMap((channel: any) =>
    trackingInviteLinkIds(channel, kind),
  );
  if (!includeUnconfigured && channels.some((channel: any) => !trackingInviteLinkIds(channel, kind).length)) {
    throw new BadRequestException(
      'Every destination channel must have the selected system link',
    );
  }
  return normalizeSelectionIds(inviteLinkIds);
}

export function savedTrackingScope(value?: Prisma.JsonValue | null): AdCampaignTrackingScope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.kind !== 'string' || !trackingDefinitions.some(([kind]) => kind === value.kind)) return null;
  if (value.channelIds === null) return { kind: value.kind, channelIds: null };
  if (!Array.isArray(value.channelIds) || !value.channelIds.every((id) => typeof id === 'string')) return null;
  return { kind: value.kind, channelIds: value.channelIds as string[] };
}

export async function updateCampaignTrackingSelection(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  campaignId: string,
  channelId: string,
  input: { trackingAllChannels?: boolean; trackingChannelIds?: string[]; trackingLinkKind?: string; botInviteLinkIds?: string[] },
) {
  const kind = input.trackingLinkKind || 'BOT';
  if (!trackingDefinitions.some(([valid]) => valid === kind)) throw new BadRequestException('Unknown system link kind');
  if (input.trackingAllChannels !== undefined)
    await acquirePostgresTransactionLock(tx, `campaign-tracking:${workspaceId}`);
  const channels = input.trackingAllChannels ? null : input.trackingChannelIds;
  const links = channels !== undefined
    ? await resolveTrackingInviteLinks(tx, workspaceId, channels, kind, channelId, input.trackingAllChannels !== undefined)
    : normalizeSelectionIds(input.botInviteLinkIds || []);
  await replaceCampaignTrackingInviteLinks(tx, workspaceId, campaignId, links, kind);
  if (input.trackingAllChannels !== undefined)
    await tx.adCampaign.update({
      where: { id: campaignId, workspaceId },
      data: { trackingScope: channels === null || channels?.length ? { kind, channelIds: channels } : Prisma.DbNull },
    });
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
  return {
    kinds: trackingDefinitions
      .map(([kind, label, tag]) => ({
        kind,
        label,
        tag,
        channels: channels
          .map((channel) => ({
            id: channel.id,
            title: channel.title,
            photoUrl: channel.photoUrl,
            hasSystemLink: trackingInviteLinkIds(channel, kind).length > 0,
          })),
      }))
      .filter((kind) => kind.channels.length),
  };
}
