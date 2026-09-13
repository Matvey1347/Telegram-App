import { Injectable, NotFoundException } from '@nestjs/common';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { withWorkspaceMemberAvatar } from '../../../common/workspace-member-presentation';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  createPaginatedResponse,
  normalizePagination,
} from '../../../common/pagination/pagination.utils';
import { parseAdsChannelIds } from '../ads-channel-scope';
import { AD_HYPOTHESIS_LIST_SELECT } from './ad-hypothesis-read-selects';
import { AdHypothesisQueryDto } from './dto/ad-hypothesis-query.dto';
import {
  buildAdHypothesisListWhere,
  OWNED_AD_HYPOTHESIS_CHANNEL_WHERE,
} from './ad-hypothesis-list-query';

export type SystemHypothesisInputs = {
  requestedChannelIds: string[];
  channels: any[];
  networks: any[];
  campaigns: any[];
};

@Injectable()
export class AdSystemHypothesesService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveInviteLinkHistoryScope(
    workspaceId: string,
    hypothesisId: string,
  ) {
    if (!hypothesisId.startsWith('system:')) return null;

    let name = 'All channels';
    let channelIds: string[] | null = null;
    if (hypothesisId.startsWith('system:channel:')) {
      const channelId = hypothesisId.slice('system:channel:'.length);
      const channel = await this.prisma.telegramChannel.findFirst({
        where: {
          id: channelId,
          workspaceId,
          ...OWNED_AD_HYPOTHESIS_CHANNEL_WHERE,
        },
        select: { id: true, title: true },
      });
      if (!channel) throw new NotFoundException('System hypothesis not found');
      name = channel.title;
      channelIds = [channel.id];
    } else if (hypothesisId.startsWith('system:network:')) {
      const networkId = hypothesisId.slice('system:network:'.length);
      const network = await this.prisma.telegramChannelNetwork.findFirst({
        where: { id: networkId, workspaceId },
        select: {
          name: true,
          channels: {
            where: {
              telegramChannel: OWNED_AD_HYPOTHESIS_CHANNEL_WHERE,
            },
            select: { telegramChannelId: true },
          },
        },
      });
      if (!network) throw new NotFoundException('System hypothesis not found');
      name = `Network: ${network.name}`;
      channelIds = network.channels.map((row) => row.telegramChannelId);
    } else if (hypothesisId !== 'system:all-channels') {
      throw new NotFoundException('System hypothesis not found');
    }

    const campaigns = await this.prisma.adCampaign.findMany({
      where: {
        workspaceId,
        telegramChannel: OWNED_AD_HYPOTHESIS_CHANNEL_WHERE,
        ...(channelIds ? { telegramChannelId: { in: channelIds } } : {}),
      },
      select: {
        id: true,
        telegramChannelId: true,
        inviteLinks: {
          select: {
            id: true,
            name: true,
            url: true,
            joinedCount: true,
            requestedCount: true,
            isRevoked: true,
          },
        },
      },
    });
    return { id: hypothesisId, name, campaigns };
  }

  async load(
    workspaceId: string,
    query: AdHypothesisQueryDto,
  ): Promise<SystemHypothesisInputs> {
    const requestedChannelIds = parseAdsChannelIds(query.telegramChannelIds);
    const channelFilter = requestedChannelIds.length
      ? { id: { in: requestedChannelIds } }
      : {};
    const [channels, networks, campaigns] = await Promise.all([
      this.prisma.telegramChannel.findMany({
        where: {
          workspaceId,
          ...OWNED_AD_HYPOTHESIS_CHANNEL_WHERE,
          ...channelFilter,
        },
        select: {
          id: true,
          title: true,
          username: true,
          photoUrl: true,
          targetCpaFrom: true,
          targetCpa: true,
          acceptableCpaFrom: true,
          acceptableCpa: true,
          stopCpaFrom: true,
          stopCpa: true,
          assignedMemberId: true,
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.telegramChannelNetwork.findMany({
        where: { workspaceId },
        select: {
          id: true,
          name: true,
          iconId: true,
          icon: true,
          assignedMemberId: true,
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdAt: true,
          updatedAt: true,
          channels: {
            where: {
              telegramChannel: {
                ...OWNED_AD_HYPOTHESIS_CHANNEL_WHERE,
                ...channelFilter,
              },
            },
            select: { telegramChannelId: true },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.adCampaign.findMany({
        where: {
          workspaceId,
          telegramChannel: OWNED_AD_HYPOTHESIS_CHANNEL_WHERE,
          ...(requestedChannelIds.length
            ? { telegramChannelId: { in: requestedChannelIds } }
            : {}),
        },
        select: AD_HYPOTHESIS_LIST_SELECT.campaigns.select.adCampaign.select,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return { requestedChannelIds, channels, networks, campaigns };
  }

  async listPage(
    workspaceId: string,
    query: AdHypothesisQueryDto,
    summarizeCampaign: (campaign: any) => any,
    aggregateSummary: (summaries: any[], channel?: any) => any,
    enrichManualHypothesis: (hypothesis: any) => any,
  ) {
    const pagination = normalizePagination(query);
    const where = buildAdHypothesisListWhere(workspaceId, query);
    const systemRows = buildSystemHypothesisRows(
      await this.load(workspaceId, query),
      query,
      summarizeCampaign,
      aggregateSummary,
    );
    const visibleSystemRows = systemRows.slice(
      pagination.skip,
      pagination.skip + pagination.take,
    );
    const manualSkip = Math.max(0, pagination.skip - systemRows.length);
    const manualTake = Math.max(0, pagination.take - visibleSystemRows.length);
    const [manualRows, manualTotal] = await Promise.all([
      this.prisma.adHypothesis.findMany({
        where,
        select: AD_HYPOTHESIS_LIST_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: manualSkip,
        take: manualTake,
      }),
      this.prisma.adHypothesis.count({ where }),
    ]);
    return createPaginatedResponse(
      [...visibleSystemRows, ...manualRows.map(enrichManualHypothesis)],
      manualTotal + systemRows.length,
      pagination,
    );
  }
}

export function buildSystemHypothesisRows(
  input: SystemHypothesisInputs,
  query: AdHypothesisQueryDto,
  summarizeCampaign: (campaign: any) => any,
  aggregateSummary: (summaries: any[], channel?: any) => any,
) {
  const campaignSummaries = input.campaigns.map(summarizeCampaign);
  const summariesByChannel = new Map<string, any[]>();
  for (const summary of campaignSummaries) {
    const channelId = summary.targetChannel?.id;
    if (!channelId) continue;
    summariesByChannel.set(channelId, [
      ...(summariesByChannel.get(channelId) ?? []),
      summary,
    ]);
  }
  const now = new Date();
  const makeRow = ({ summaries, channel = null, ...row }: any) => {
    const summary = aggregateSummary(summaries, channel);
    return {
      description: null,
      status: 'testing',
      conclusion: null,
      iconId: null,
      icon: null,
      createdAt: now,
      updatedAt: now,
      ...row,
      iconPresentation: iconToResolvedEmoji(row.icon),
      telegramChannelId: channel?.id ?? null,
      telegramChannel: channel,
      assignedMember: withWorkspaceMemberAvatar(row.assignedMember),
      isSystem: true,
      allCampaignsExcludedFromAnalytics:
        summaries.length > 0 &&
        summaries.every((campaign: any) => campaign.excludeFromAnalytics),
      excludedCampaignsCount: summaries.filter((campaign: any) =>
        Boolean(campaign.excludeFromAnalytics),
      ).length,
      campaignsCount: summary.campaignsCount,
      summary,
    };
  };
  const rows: any[] = [];
  if (!input.requestedChannelIds.length) {
    rows.push(
      makeRow({
        id: 'system:all-channels',
        name: 'All channels',
        systemScope: { kind: 'all_channels' },
        summaries: campaignSummaries,
      }),
    );
  }
  for (const channel of input.channels) {
    rows.push(
      makeRow({
        id: `system:channel:${channel.id}`,
        name: channel.title,
        systemScope: { kind: 'channel', channelId: channel.id },
        summaries: summariesByChannel.get(channel.id) ?? [],
        channel,
        assignedMemberId: channel.assignedMemberId,
        assignedMember: channel.assignedMember,
        createdAt: channel.createdAt,
        updatedAt: channel.updatedAt,
      }),
    );
  }
  for (const network of input.networks) {
    const channelIds = network.channels.map(
      (member: any) => member.telegramChannelId,
    );
    if (!channelIds.length) continue;
    rows.push(
      makeRow({
        id: `system:network:${network.id}`,
        name: `Network: ${network.name}`,
        systemScope: { kind: 'network', networkId: network.id, channelIds },
        summaries: channelIds.flatMap(
          (channelId: string) => summariesByChannel.get(channelId) ?? [],
        ),
        icon: network.icon,
        iconId: network.iconId,
        assignedMemberId: network.assignedMemberId,
        assignedMember: network.assignedMember,
        createdAt: network.createdAt,
        updatedAt: network.updatedAt,
      }),
    );
  }
  const search = query.search?.trim().toLocaleLowerCase();
  return search
    ? rows.filter((row) =>
        `${row.name} ${row.telegramChannel?.username ?? ''}`
          .toLocaleLowerCase()
          .includes(search),
      )
    : rows;
}
