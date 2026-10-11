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
import { TelegramChannelAudienceTrendReadService } from '../telegram-channels/telegram-channel-audience-trend-read.service';
import { TelegramChannelTrafficAttributionService } from '../telegram-channels/telegram-channel-traffic-attribution.service';
import { CreateTelegramChannelNetworkDto } from './dto/create-telegram-channel-network.dto';
import { UpdateTelegramChannelNetworkDto } from './dto/update-telegram-channel-network.dto';
import { TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL } from '../telegram-channels/telegram-channels.internal';
import type { PreparedTelegramChannelFinancialSummaries } from '../telegram-channels/telegram-channel-financial-summary-preparation';
import { resolveMajorityChannelCurrency } from './telegram-channel-network-currency';
import {
  audienceFromChannel,
  hasMeaningfulChannelData,
  presentChannelNetwork,
} from './telegram-channel-network-presentation';
import { TelegramNetworkPerformanceHistoryService } from './telegram-network-performance-history.service';
import type { TelegramChannelPerformanceHistoryRange } from '@telegram-system/shared';

export const SYSTEM_ALL_NETWORK_ID = 'system-all';

const SYSTEM_ALL_NETWORK_ICON = {
  type: 'image' as const,
  id: 'telegram-system-all-network',
  url: TELEGRAM_IMPORTED_SYSTEM_GROUP_ICON_IMAGE_URL,
  name: 'Telegram',
};

function channelDrops(
  trends: Awaited<
    ReturnType<TelegramChannelAudienceTrendReadService['summariesForChannels']>
  >,
) {
  return new Map(
    [...trends].map(([channelId, preview]) => [
      channelId,
      Math.max(0, -(preview.trend?.metrics.subscribers?.absoluteChange ?? 0)),
    ]),
  );
}

@Injectable()
export class TelegramChannelNetworksService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private financialReadService: TelegramChannelFinancialReadService,
    private audienceTrendReadService: TelegramChannelAudienceTrendReadService,
    private trafficAttributionService: TelegramChannelTrafficAttributionService,
    private networkPerformanceHistory: TelegramNetworkPerformanceHistoryService,
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

  private async enrichNetwork(network: any) {
    const channels = network.channels.map(
      (member: any) => member.telegramChannel,
    );
    const audiences = channels.map(audienceFromChannel);
    const summaryCurrency = resolveMajorityChannelCurrency(
      channels,
      channels[0]?.kpiCurrency ?? 'USD',
    );
    const financialSummaries =
      await this.financialReadService.buildChannelFinancialSummaryPreview(
        network.workspaceId,
        channels.map((channel: any, index: number) => ({
          ...channel,
          audienceSnapshots: [audiences[index]],
        })),
        { targetCurrency: summaryCurrency },
      );
    const ids = channels.map((channel: any) => channel.id);
    const trendNow = new Date();
    const trends = await this.audienceTrendReadService.summariesForChannels(
      network.workspaceId,
      ids,
      30,
      trendNow,
    );
    const traffic = await this.trafficAttributionService.summariesForChannels(
      network.workspaceId,
      ids,
      {
        windowDays: 30,
        now: trendNow,
        channelDropByChannel: channelDrops(trends),
      },
    );
    return presentChannelNetwork(
      {
        ...network,
        channels: network.channels.map((member: any) => ({
          ...member,
          telegramChannel: {
            ...member.telegramChannel,
            audienceTrend: trends.get(member.telegramChannel.id)?.trend ?? null,
            trafficAttribution: traffic.get(member.telegramChannel.id) ?? null,
          },
        })),
      },
      audiences,
      financialSummaries,
    );
  }

  private async enrichNetworkFromPreparation(
    network: any,
    preparation: PreparedTelegramChannelFinancialSummaries,
    trends: Awaited<
      ReturnType<
        TelegramChannelAudienceTrendReadService['summariesForChannels']
      >
    >,
    traffic: Awaited<
      ReturnType<
        TelegramChannelTrafficAttributionService['summariesForChannels']
      >
    >,
  ) {
    const channels = network.channels.map(
      (member: any) => member.telegramChannel,
    );
    const audiences = channels.map(audienceFromChannel);
    const targetCurrency = resolveMajorityChannelCurrency(
      channels,
      channels[0]?.kpiCurrency ?? 'USD',
    );
    const financialSummaries = await preparation.build(
      channels.map((channel: any, index: number) => ({
        ...channel,
        audienceSnapshots: [audiences[index]],
      })),
      { targetCurrency },
    );
    return presentChannelNetwork(
      {
        ...network,
        channels: network.channels.map((member: any) => ({
          ...member,
          telegramChannel: {
            ...member.telegramChannel,
            audienceTrend: trends.get(member.telegramChannel.id)?.trend ?? null,
            trafficAttribution: traffic.get(member.telegramChannel.id) ?? null,
          },
        })),
      },
      audiences,
      financialSummaries,
    );
  }

  private async loadSystemNetworkInput(workspaceId: string) {
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
        isTest: false,
        adminLinks: { some: {} },
      },
      include: { audienceSnapshots: this.audienceSnapshotInclude },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    return { workspace, excludedTelegramChannelIds, channels };
  }

  private async buildSystemNetwork(
    workspaceId: string,
    input: Awaited<ReturnType<typeof this.loadSystemNetworkInput>>,
    preparation?: PreparedTelegramChannelFinancialSummaries,
    trends?: Awaited<
      ReturnType<
        TelegramChannelAudienceTrendReadService['summariesForChannels']
      >
    >,
    traffic?: Awaited<
      ReturnType<
        TelegramChannelTrafficAttributionService['summariesForChannels']
      >
    >,
  ) {
    const { workspace, excludedTelegramChannelIds, channels } = input;
    const audiences = channels.map(audienceFromChannel);
    const summaryCurrency = resolveMajorityChannelCurrency(
      channels,
      workspace?.primaryCurrency ?? 'USD',
    );
    const financialInputs = channels.map((channel, index) => ({
      ...channel,
      audienceSnapshots: [audiences[index]],
    }));
    const financialSummaries = preparation
      ? await preparation.build(financialInputs, {
          targetCurrency: summaryCurrency,
        })
      : await this.financialReadService.buildChannelFinancialSummaryPreview(
          workspaceId,
          financialInputs,
          { targetCurrency: summaryCurrency },
        );
    const eligible = channels.flatMap((channel, index) =>
      hasMeaningfulChannelData(
        channel,
        audiences[index],
        financialSummaries.get(channel.id),
      )
        ? [{ channel, audience: audiences[index] }]
        : [],
    );
    return presentChannelNetwork(
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
        channels: eligible.map(({ channel: telegramChannel }) => ({
          telegramChannel: {
            ...telegramChannel,
            audienceTrend: trends?.get(telegramChannel.id)?.trend ?? null,
            trafficAttribution: traffic?.get(telegramChannel.id) ?? null,
          },
        })),
      },
      eligible.map(({ audience }) => audience),
      financialSummaries,
    );
  }

  private async systemNetwork(workspaceId: string) {
    const input = await this.loadSystemNetworkInput(workspaceId);
    return this.buildSystemNetwork(workspaceId, input);
  }

  private async networkChannelIds(workspaceId: string, networkId: string) {
    if (networkId === SYSTEM_ALL_NETWORK_ID) {
      const input = await this.loadSystemNetworkInput(workspaceId);
      return input.channels.map((channel) => channel.id);
    }
    const network = await this.prisma.telegramChannelNetwork.findFirst({
      where: { id: networkId, workspaceId },
      select: { channels: { select: { telegramChannelId: true } } },
    });
    if (!network)
      throw new NotFoundException('Telegram channel network not found');
    return network.channels.map((member) => member.telegramChannelId);
  }

  async trafficAttribution(userId: string, networkId: string) {
    const workspaceId = await this.workspace(userId);
    const channelIds = await this.networkChannelIds(workspaceId, networkId);
    const now = new Date();
    const trends = await this.audienceTrendReadService.summariesForChannels(
      workspaceId,
      channelIds,
      30,
      now,
    );
    return this.trafficAttributionService.detailForChannels(
      workspaceId,
      channelIds,
      networkId,
      { windowDays: 30, now, channelDropByChannel: channelDrops(trends) },
    );
  }

  async performanceHistory(
    userId: string,
    networkId: string,
    range?: TelegramChannelPerformanceHistoryRange,
  ) {
    const workspaceId = await this.workspace(userId);
    const channelIds = await this.networkChannelIds(workspaceId, networkId);
    return this.networkPerformanceHistory.history(
      workspaceId,
      channelIds,
      range,
    );
  }

  async list(userId: string, query: { page?: number; pageSize?: number } = {}) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const includeSystem = pagination.skip === 0;
    const customSkip = Math.max(0, pagination.skip - 1);
    const customTake = Math.max(0, pagination.take - (includeSystem ? 1 : 0));
    const [networks, totalItems, systemInput] = await Promise.all([
      this.prisma.telegramChannelNetwork.findMany({
        // Empty system/imported network shells have no operational value and
        // must not occupy a card in the Networks view.
        where: { workspaceId, channels: { some: {} } },
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
      this.prisma.telegramChannelNetwork.count({
        where: { workspaceId, channels: { some: {} } },
      }),
      includeSystem ? this.loadSystemNetworkInput(workspaceId) : null,
    ]);
    const channelsById = new Map<string, any>();
    for (const network of networks) {
      for (const member of network.channels) {
        channelsById.set(member.telegramChannel.id, member.telegramChannel);
      }
    }
    for (const channel of systemInput?.channels ?? []) {
      channelsById.set(channel.id, channel);
    }
    const financialPreparation =
      await this.financialReadService.prepareChannelFinancialSummaryPreview(
        workspaceId,
        [...channelsById.values()],
      );
    const channelIds = [...channelsById.keys()];
    const trendNow = new Date();
    const trends = await this.audienceTrendReadService.summariesForChannels(
      workspaceId,
      channelIds,
      30,
      trendNow,
    );
    const traffic = await this.trafficAttributionService.summariesForChannels(
      workspaceId,
      channelIds,
      {
        windowDays: 30,
        now: trendNow,
        channelDropByChannel: channelDrops(trends),
      },
    );
    const [system, customItems] = await Promise.all([
      systemInput
        ? this.buildSystemNetwork(
            workspaceId,
            systemInput,
            financialPreparation,
            trends,
            traffic,
          )
        : null,
      Promise.all(
        networks.map((network) =>
          this.enrichNetworkFromPreparation(
            network,
            financialPreparation,
            trends,
            traffic,
          ),
        ),
      ),
    ]);
    return createPaginatedResponse(
      system && (systemInput?.channels.length ?? 0) > 0
        ? [system, ...customItems]
        : customItems,
      totalItems + (system && (systemInput?.channels.length ?? 0) > 0 ? 1 : 0),
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
          isTest: false,
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
