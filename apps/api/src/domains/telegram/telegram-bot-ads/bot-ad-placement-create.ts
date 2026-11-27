import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BotAdPlacementCampaign } from '@telegram-system/shared';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { TelegramManagedPostCommandService } from '../telegram-channels/telegram-managed-post-command.service';
import type { TelegramChannelNetworkOptionsService } from '../telegram-channel-networks/telegram-channel-network-options.service';
import { buildPlacementCreative } from './bot-ad-placement-creative';
import type { CreateBotAdPlacementsDto } from './bot-ads.dto';
import {
  botAdLinkSelect,
  botAdLinkView,
  readBotAdCreative,
  telegramBotAdUrl,
} from './bot-ads-read';

export async function createBotAdPlacements({
  prisma,
  posts,
  networks,
  runtime,
  workspaceChannels,
  apiOrigin,
  dto,
}: {
  prisma: PrismaService;
  posts: TelegramManagedPostCommandService;
  networks: TelegramChannelNetworkOptionsService;
  runtime: {
    workspaceId: string;
    runtimeInstanceId: string;
    username: string;
    userId: string;
  };
  workspaceChannels: Prisma.TelegramChannelWhereInput;
  apiOrigin?: string;
  dto: CreateBotAdPlacementsDto;
}) {
  const { workspaceId, runtimeInstanceId, username } = runtime;
  const title = dto.title.trim();
  const targetIds = dto.targets.map(({ id }) => id);
  const channelIds = dto.targets.map(({ channelId }) => channelId);
  if (
    !username ||
    !title ||
    new Set(channelIds).size !== channelIds.length ||
    new Set(targetIds).size !== targetIds.length
  ) {
    throw new BadRequestException(
      'Supply a campaign name, bot username and distinct channels',
    );
  }
  const read = () =>
    prisma.botAdLink.findMany({
      where: { runtimeInstanceId, id: { in: targetIds } },
      select: botAdLinkSelect,
    });
  const view = (rows: Awaited<ReturnType<typeof read>>) => {
    const requested = new Map(
      dto.targets.map((target) => [target.id, target.channelId]),
    );
    if (
      rows.length !== dto.targets.length ||
      rows.some(
        (row) =>
          row.campaignId !== dto.campaignId ||
          row.promo?.id !== dto.promoId ||
          row.channel?.id !== requested.get(row.id),
      )
    )
      throw new ConflictException('Placement link IDs are already in use');
    return rows.map((row) => botAdLinkView(row, username, apiOrigin));
  };
  const existing = await read();
  if (existing.length) return view(existing);

  const channelWhere = {
    ...workspaceChannels,
    id: { in: channelIds },
  };
  const promoWhere = { id: dto.promoId, runtimeInstanceId };
  const [channels, promo, networkOptions, icon] = await Promise.all([
    prisma.telegramChannel.findMany({
      where: channelWhere,
      select: { id: true, title: true },
    }),
    prisma.botAdPromo.findUnique({
      where: promoWhere,
      select: { post: true, title: true },
    }),
    dto.networkIds?.length ? networks.list(runtime.userId) : [],
    dto.iconId
      ? prisma.icon.findFirst({
          where: {
            id: dto.iconId,
            OR: [{ workspaceId }, { workspaceId: null }],
          },
          select: {
            id: true,
            type: true,
            emoji: true,
            name: true,
            imageUrl: true,
          },
        })
      : null,
  ]);
  const plannedAt = dto.plannedAt ? new Date(dto.plannedAt) : null;
  if (
    Boolean(plannedAt) !== Boolean(dto.date) ||
    (plannedAt && !(plannedAt.getTime() > Date.now()))
  )
    throw new BadRequestException('Choose a future campaign date and time');
  if (dto.iconId && !icon)
    throw new BadRequestException('Campaign emoji is unavailable');
  const selectedNetworks = networkOptions.filter(({ id }) =>
    dto.networkIds?.includes(id),
  );
  if (selectedNetworks.length !== (dto.networkIds?.length ?? 0))
    throw new NotFoundException('Network is unavailable');
  if (selectedNetworks.length) {
    const networkChannels = new Set(
      selectedNetworks.flatMap(({ channels }) => channels.map(({ id }) => id)),
    );
    const eligible = await prisma.telegramChannel.findMany({
      where: {
        ...workspaceChannels,
        id: { in: [...networkChannels] },
      },
      select: { id: true },
    });
    if (
      eligible.length !== channelIds.length ||
      eligible.some(({ id }) => !channelIds.includes(id))
    )
      throw new BadRequestException(
        'Network membership changed. Reload the publishing channels and try again.',
      );
  }
  if (!promo) throw new NotFoundException('Promo not found');
  if (channels.length !== channelIds.length)
    throw new NotFoundException(
      'At least one workspace channel is unavailable',
    );

  const channelNames = new Map(
    channels.map((channel) => [channel.id, channel.title]),
  );
  const creative = readBotAdCreative(promo.post);
  const placements = dto.targets.map(({ id, channelId }) => {
    const name = [title, dto.date, channelNames.get(channelId), promo.title]
      .filter(Boolean)
      .map((part) => part!.slice(0, 48))
      .join(' // ');
    const url = apiOrigin
      ? `${apiOrigin}/api/bot-ad-links/${id}`
      : telegramBotAdUrl(username, id);
    return {
      id,
      channelId,
      dto: { title: name, ...buildPlacementCreative(creative, url) },
    };
  });
  try {
    await posts.createManagedPostDrafts(
      runtime.userId,
      placements,
      async (tx, postIds) => {
        if (!(await tx.botAdPromo.count({ where: promoWhere })))
          throw new NotFoundException('Promo not found');
        if (
          (await tx.telegramChannel.count({ where: channelWhere })) !==
          channelIds.length
        )
          throw new NotFoundException(
            'At least one workspace channel is unavailable',
          );
        await tx.botAdLink.createMany({
          data: placements.map(({ id, channelId, dto: post }, index) => ({
            id,
            runtimeInstanceId,
            campaignId: dto.campaignId,
            campaignDetails: {
              title,
              date: dto.date ?? null,
              plannedAt: plannedAt?.toISOString() ?? null,
              iconPresentation: iconToResolvedEmoji(icon),
              networks: selectedNetworks
                .filter((network) =>
                  network.channels.some(({ id }) => id === channelId),
                )
                .map(({ id, name, iconPresentation }) => ({
                  id,
                  name,
                  iconPresentation: iconPresentation ?? null,
                })),
            } satisfies BotAdPlacementCampaign,
            title: post.title,
            promoId: dto.promoId,
            telegramChannelId: channelId,
            managedPostId: postIds[index],
            tracked: Boolean(apiOrigin),
          })),
        });
      },
    );
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    )
      throw error;
  }
  return view(await read());
}
