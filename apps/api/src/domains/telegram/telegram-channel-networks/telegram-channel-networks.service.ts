import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelFinancialReadService } from '../telegram-channels/telegram-channel-financial-read.service';
import { CreateTelegramChannelNetworkDto } from './dto/create-telegram-channel-network.dto';
import { UpdateTelegramChannelNetworkDto } from './dto/update-telegram-channel-network.dto';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL } from '../telegram-channels/telegram-channels.internal';
import { aggregateChannelNetworkSummary } from './telegram-channel-network-summary';
import { resolveMajorityChannelCurrency } from './telegram-channel-network-currency';

export const SYSTEM_ALL_NETWORK_ID = 'system-all';

const SYSTEM_ALL_NETWORK_ICON = {
  type: 'image' as const,
  id: 'telegram-system-all-network',
  url: TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL,
  name: 'Telegram',
};

@Injectable()
export class TelegramChannelNetworksService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private financialReadService: TelegramChannelFinancialReadService,
  ) {}

  private readonly audienceSnapshotInclude = {
    orderBy: { collectedAt: 'desc' as const },
    take: 1,
    select: {
      subscribersCount: true,
      activeSubscribersEstimate: true,
      viewRate: true,
      avgViewsAdjusted: true,
      avgReactionsAdjusted: true,
      dataQuality: true,
      dataQualityReason: true,
      hasExternalTrafficAnomaly: true,
      hasSubscriberBasePollution: true,
      postsWindow: true,
    },
  };

  private workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private dedupeChannelIds(channelIds: string[]) {
    const cleanIds = channelIds
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    const uniqueIds = [...new Set(cleanIds)];
    if (uniqueIds.length !== cleanIds.length) {
      throw new BadRequestException('Telegram channel ids must be unique');
    }
    if (uniqueIds.length < 2) {
      throw new BadRequestException('Network must contain at least 2 channels');
    }
    return uniqueIds;
  }

  private async validateChannels(workspaceId: string, channelIds: string[]) {
    const uniqueIds = this.dedupeChannelIds(channelIds);
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        id: { in: uniqueIds },
        isActive: true,
        adminLinks: { some: {} },
      },
      orderBy: { title: 'asc' },
    });
    if (channels.length !== uniqueIds.length) {
      throw new BadRequestException(
        'All channels must be own active channels in selected workspace',
      );
    }
    return { uniqueIds, channels };
  }

  private async resolveIconId(
    workspaceId: string,
    rawIconId: string | null | undefined,
  ) {
    const iconId = rawIconId?.trim() || null;
    if (!iconId) return null;
    const icon = await this.prisma.icon.findFirst({
      where: {
        id: iconId,
        OR: [{ workspaceId }, { workspaceId: null }],
      },
      select: { id: true },
    });
    if (!icon) throw new NotFoundException('Icon not found');
    return iconId;
  }

  private assertMutable(networkId: string) {
    if (networkId === SYSTEM_ALL_NETWORK_ID) {
      throw new ForbiddenException('System network cannot be modified');
    }
  }

  private assertNonSystemName(name?: string) {
    if (name?.trim().toLowerCase() === 'all') {
      throw new BadRequestException('All is reserved for the system network');
    }
  }

  private audienceFromChannel(channel: any) {
    const snapshot = channel.audienceSnapshots?.[0];
    const avgViewsAdjusted = snapshot?.avgViewsAdjusted ?? null;
    const avgReactionsAdjusted = snapshot?.avgReactionsAdjusted ?? null;
    return {
      subscribersCount:
        snapshot?.subscribersCount ?? channel.currentSubscribersCount ?? null,
      activeSubscribersEstimate: snapshot?.activeSubscribersEstimate ?? null,
      paidActiveSubscribersEstimate:
        snapshot?.activeSubscribersEstimate ?? null,
      viewRate: snapshot?.viewRate ?? null,
      avgViewsAdjusted,
      avgReactionsAdjusted,
      reactionRate:
        avgViewsAdjusted != null && avgViewsAdjusted > 0
          ? (Number(avgReactionsAdjusted || 0) / avgViewsAdjusted) * 100
          : null,
      dataQuality: snapshot?.dataQuality ?? null,
      dataQualityReason: snapshot?.dataQualityReason ?? null,
      hasExternalTrafficAnomaly: snapshot?.hasExternalTrafficAnomaly ?? false,
      hasSubscriberBasePollution: snapshot?.hasSubscriberBasePollution ?? false,
      postsWindow: snapshot?.postsWindow ?? channel.activeSubscribersWindow,
      hasSnapshot: Boolean(snapshot),
    };
  }

  private channelSummary(
    channel: {
      id: string;
      title: string;
      username: string | null;
      photoUrl: string | null;
      currentSubscribersCount: number | null;
      pendingJoinRequestsCount: number;
    },
    audience: any,
    finance: any,
  ) {
    return {
      channelId: channel.id,
      id: channel.id,
      title: channel.title,
      name: channel.title,
      username: channel.username,
      photoUrl: channel.photoUrl,
      subscribersCount: audience.subscribersCount,
      currentSubscribersCount: channel.currentSubscribersCount,
      pendingJoinRequestsCount: channel.pendingJoinRequestsCount,
      activeSubscribersEstimate: audience.activeSubscribersEstimate,
      paidActiveSubscribersEstimate: audience.paidActiveSubscribersEstimate,
      viewRate: audience.viewRate,
      reactionRate: audience.reactionRate,
      avgViewsAdjusted: audience.avgViewsAdjusted,
      avgReactionsAdjusted: audience.avgReactionsAdjusted,
      currency: finance.currency,
      totalAdSpend: finance.totalAdSpend,
      campaignsCount: finance.campaignsCount,
      totalJoinedSubscribers: finance.totalJoinedSubscribers,
      totalPendingSubscribers: finance.totalPendingSubscribers,
      totalAttributedSubscribers: finance.totalAttributedSubscribers,
      avgCpa: finance.avgCpa,
      activeCpa: finance.activeCpa,
      kpiStatus: finance.kpiStatus,
      kpiLabel: finance.kpiLabel,
      assetEconomics: finance.assetEconomics,
    };
  }

  private async enrichNetwork(
    network: any,
    prepared?: Map<string, { audience: any; finance: any }>,
  ) {
    const channels = network.channels.map(
      (member: any) => member.telegramChannel,
    );
    const audiences = channels.map(
      (channel: any) =>
        prepared?.get(channel.id)?.audience ??
        this.audienceFromChannel(channel),
    );
    const summaryCurrency = resolveMajorityChannelCurrency(
      channels,
      channels[0]?.kpiCurrency ?? 'USD',
    );
    const financialSummaries = prepared
      ? new Map(
          channels.map((channel: any) => [
            channel.id,
            prepared.get(channel.id)?.finance,
          ]),
        )
      : await this.financialReadService.buildChannelFinancialSummaryPreview(
          network.workspaceId,
          channels.map((channel: any, index: number) => ({
            ...channel,
            audienceSnapshots: [audiences[index]],
          })),
          { targetCurrency: summaryCurrency },
        );
    const channelSummaries = channels.map((channel: any, index: number) =>
      this.channelSummary(
        channel,
        audiences[index],
        financialSummaries.get(channel.id),
      ),
    );
    const summary = aggregateChannelNetworkSummary(channelSummaries);
    return {
      id: network.id,
      name: network.name,
      description: network.description,
      iconId: network.iconId,
      iconPresentation:
        network.iconPresentation ?? iconToResolvedEmoji(network.icon),
      createdAt: network.createdAt,
      updatedAt: network.updatedAt,
      assignedMemberId: network.assignedMemberId,
      assignedMember: network.assignedMember,
      createdByUserId: network.createdByUserId,
      createdByUser: network.createdByUser,
      isSystem: Boolean(network.isSystem),
      systemKey: network.isSystem ? 'ALL' : null,
      canEdit: true,
      canDelete: !network.isSystem,
      excludedTelegramChannelIds:
        network.excludedTelegramChannelIds ?? undefined,
      channels: channelSummaries.map((channel) => ({
        id: channel.id,
        title: channel.title,
        name: channel.name,
        username: channel.username,
        photoUrl: channel.photoUrl,
        subscribersCount: channel.subscribersCount,
        pendingJoinRequestsCount: channel.pendingJoinRequestsCount,
        currentSubscribersCount: channel.currentSubscribersCount,
        activeSubscribersEstimate: channel.activeSubscribersEstimate,
      })),
      summary,
      channelSummaries,
    };
  }

  private hasMeaningfulData(channel: any, audience: any, finance: any) {
    const economics = finance.assetEconomics;
    return Boolean(
      channel.currentSubscribersCount != null ||
      Number(channel.pendingJoinRequestsCount || 0) > 0 ||
      audience.hasSnapshot ||
      Number(finance.campaignsCount || 0) > 0 ||
      Number(finance.totalAdSpend || 0) !== 0 ||
      Number(economics?.invested || 0) !== 0 ||
      Number(economics?.revenue || 0) !== 0 ||
      economics?.formatPricing?.permanent?.expectedViews != null,
    );
  }

  private async systemNetwork(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        systemNetworkExcludedChannelIds: true,
        primaryCurrency: true,
      },
    });
    const excludedTelegramChannelIds =
      workspace?.systemNetworkExcludedChannelIds ?? [];
    const channels = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        id: { notIn: excludedTelegramChannelIds },
        isActive: true,
        archivedAt: null,
        adminLinks: { some: {} },
      },
      include: { audienceSnapshots: this.audienceSnapshotInclude },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    const audiences = channels.map((channel) =>
      this.audienceFromChannel(channel),
    );
    const summaryCurrency = resolveMajorityChannelCurrency(
      channels,
      workspace?.primaryCurrency ?? 'USD',
    );
    const financialSummaries =
      await this.financialReadService.buildChannelFinancialSummaryPreview(
        workspaceId,
        channels.map((channel, index) => ({
          ...channel,
          audienceSnapshots: [audiences[index]],
        })),
        { targetCurrency: summaryCurrency },
      );
    const eligibleChannels = channels.filter((channel, index) =>
      this.hasMeaningfulData(
        channel,
        audiences[index],
        financialSummaries.get(channel.id),
      ),
    );
    const prepared = new Map(
      eligibleChannels.map((channel) => {
        const index = channels.findIndex(
          (candidate) => candidate.id === channel.id,
        );
        return [
          channel.id,
          {
            audience: audiences[index],
            finance: financialSummaries.get(channel.id),
          },
        ];
      }),
    );
    return this.enrichNetwork(
      {
        id: SYSTEM_ALL_NETWORK_ID,
        workspaceId,
        name: 'All',
        description: 'All own channels with analytics or financial activity',
        iconId: null,
        icon: null,
        iconPresentation: SYSTEM_ALL_NETWORK_ICON,
        isSystem: true,
        excludedTelegramChannelIds,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        assignedMemberId: null,
        assignedMember: null,
        createdByUserId: null,
        createdByUser: null,
        channels: eligibleChannels.map((telegramChannel) => ({
          telegramChannel,
        })),
      },
      prepared,
    );
  }

  async list(userId: string, query: { page?: number; pageSize?: number } = {}) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const includeSystem = pagination.skip === 0;
    const customSkip = Math.max(0, pagination.skip - 1);
    const customTake = Math.max(0, pagination.take - (includeSystem ? 1 : 0));
    const [networks, totalItems] = await Promise.all([
      this.prisma.telegramChannelNetwork.findMany({
        where: { workspaceId },
        include: {
          icon: true,
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
          channels: {
            include: {
              telegramChannel: {
                include: {
                  audienceSnapshots: this.audienceSnapshotInclude,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: customSkip,
        take: customTake,
      }),
      this.prisma.telegramChannelNetwork.count({ where: { workspaceId } }),
    ]);
    const [system, customItems] = await Promise.all([
      includeSystem ? this.systemNetwork(workspaceId) : null,
      Promise.all(networks.map((network) => this.enrichNetwork(network))),
    ]);
    return createPaginatedResponse(
      system ? [system, ...customItems] : customItems,
      totalItems + 1,
      pagination,
    );
  }

  async getById(userId: string, networkId: string) {
    const workspaceId = await this.workspace(userId);
    if (networkId === SYSTEM_ALL_NETWORK_ID) {
      return this.systemNetwork(workspaceId);
    }
    const network = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      include: {
        icon: true,
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
        channels: {
          include: {
            telegramChannel: {
              include: { audienceSnapshots: this.audienceSnapshotInclude },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!network)
      throw new NotFoundException('Telegram channel network not found');
    return this.enrichNetwork(network);
  }

  async create(userId: string, dto: CreateTelegramChannelNetworkDto) {
    this.assertNonSystemName(dto.name);
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const iconId = await this.resolveIconId(workspaceId, dto.iconId);
    const { uniqueIds } = await this.validateChannels(
      workspaceId,
      dto.telegramChannelIds,
    );
    const network = await this.prisma.telegramChannelNetwork.create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        iconId,
        assignedMemberId,
        createdByUserId: userId,
        channels: {
          create: uniqueIds.map((telegramChannelId) => ({
            workspaceId,
            telegramChannelId,
          })),
        },
      },
    });
    return this.getById(userId, network.id);
  }

  async update(
    userId: string,
    networkId: string,
    dto: UpdateTelegramChannelNetworkDto,
  ) {
    if (networkId === SYSTEM_ALL_NETWORK_ID) {
      if (dto.excludedTelegramChannelIds === undefined) {
        throw new BadRequestException(
          'System network update requires excluded channel ids',
        );
      }
      const workspaceId = await this.workspace(userId);
      const excludedIds = [
        ...new Set(
          (dto.excludedTelegramChannelIds ?? []).map((id) => id.trim()),
        ),
      ].filter(Boolean);
      const channels = await this.prisma.telegramChannel.findMany({
        where: {
          workspaceId,
          id: { in: excludedIds },
          isActive: true,
          archivedAt: null,
          adminLinks: { some: {} },
        },
        select: { id: true },
      });
      if (channels.length !== excludedIds.length) {
        throw new BadRequestException(
          'Excluded channels must be own active channels in selected workspace',
        );
      }
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: { systemNetworkExcludedChannelIds: excludedIds },
      });
      return this.systemNetwork(workspaceId);
    }
    this.assertMutable(networkId);
    this.assertNonSystemName(dto.name);
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      select: { id: true },
    });
    if (!existing)
      throw new NotFoundException('Telegram channel network not found');
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    const iconId =
      dto.iconId === undefined
        ? undefined
        : await this.resolveIconId(workspaceId, dto.iconId);

    const uniqueIds = dto.telegramChannelIds
      ? (await this.validateChannels(workspaceId, dto.telegramChannelIds))
          .uniqueIds
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.telegramChannelNetwork.update({
        where: { id: networkId },
        data: {
          name: dto.name === undefined ? undefined : dto.name.trim(),
          description:
            dto.description === undefined
              ? undefined
              : dto.description?.trim() || null,
          iconId,
          assignedMemberId,
        },
      });
      if (uniqueIds) {
        await tx.telegramChannelNetworkMember.deleteMany({
          where: { networkId, workspaceId },
        });
        await tx.telegramChannelNetworkMember.createMany({
          data: uniqueIds.map((telegramChannelId) => ({
            workspaceId,
            networkId,
            telegramChannelId,
          })),
        });
      }
    });

    return this.getById(userId, networkId);
  }

  async remove(userId: string, networkId: string) {
    this.assertMutable(networkId);
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      select: { id: true },
    });
    if (!existing)
      throw new NotFoundException('Telegram channel network not found');
    await this.prisma.telegramChannelNetwork.delete({
      where: { id: networkId },
    });
    return { success: true };
  }

  async getNetworkSummary(userId: string, networkId: string) {
    const network = await this.getById(userId, networkId);
    return network.summary;
  }
}
