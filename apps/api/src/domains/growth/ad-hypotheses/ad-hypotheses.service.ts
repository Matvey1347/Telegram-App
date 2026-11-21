import { hasBothInviteCounters } from '../../telegram/telegram-channels/telegram-invite-counter-observations';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateAdHypothesisDto } from './dto/create-ad-hypothesis.dto';
import {
  AD_HYPOTHESIS_STATUSES,
  UpdateAdHypothesisDto,
} from './dto/update-ad-hypothesis.dto';
import { AD_HYPOTHESIS_DETAIL_INCLUDE } from './ad-hypothesis-read-selects';
import { AdHypothesisQueryDto } from './dto/ad-hypothesis-query.dto';
import { AdSystemHypothesesService } from './ad-system-hypotheses.service';
import { buildHypothesisInviteLinkHistoryPayload } from './ad-hypothesis-invite-link-history';
import {
  campaignSummary,
  aggregateSummary,
  enrichHypothesis,
} from './ad-hypothesis-summary';

type HypothesisStatus = (typeof AD_HYPOTHESIS_STATUSES)[number];

@Injectable()
export class AdHypothesesService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private systemHypothesesService: AdSystemHypothesesService,
  ) {}

  private workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private normalizeStatus(status?: string | null): HypothesisStatus {
    const normalized = String(status || 'testing').trim() as HypothesisStatus;
    if (!AD_HYPOTHESIS_STATUSES.includes(normalized)) {
      throw new BadRequestException('Invalid hypothesis status');
    }
    return normalized;
  }

  private dedupeCampaignIds(campaignIds: string[]) {
    const cleanIds = campaignIds
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    const uniqueIds = [...new Set(cleanIds)];
    if (uniqueIds.length !== cleanIds.length) {
      throw new BadRequestException('Ad campaign ids must be unique');
    }
    if (!uniqueIds.length) {
      throw new BadRequestException(
        'Hypothesis must contain at least 1 campaign',
      );
    }
    return uniqueIds;
  }

  private async validateCampaigns(workspaceId: string, campaignIds: string[]) {
    const uniqueIds = this.dedupeCampaignIds(campaignIds);
    const campaigns = await (this.prisma.adCampaign as any).findMany({
      where: { workspaceId, id: { in: uniqueIds } },
      select: { id: true, telegramChannelId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (campaigns.length !== uniqueIds.length) {
      throw new BadRequestException(
        'All ad campaigns must exist and belong to selected workspace',
      );
    }
    return { uniqueIds, campaigns };
  }

  private async validateTelegramChannel(
    workspaceId: string,
    telegramChannelId?: string | null,
  ) {
    const normalizedId = String(telegramChannelId || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('Telegram channel is required');
    }
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: normalizedId, workspaceId },
    });
    if (!channel) {
      throw new BadRequestException(
        'Telegram channel must exist and belong to selected workspace',
      );
    }
    return channel;
  }

  private includeHypothesisCampaigns() {
    return AD_HYPOTHESIS_DETAIL_INCLUDE;
  }

  async list(userId: string, query: AdHypothesisQueryDto = {}) {
    const workspaceId = await this.workspace(userId);
    return this.systemHypothesesService.listPage(
      workspaceId,
      query,
      (campaign) => campaignSummary(campaign),
      (summaries, channel) => aggregateSummary(summaries, channel),
      (hypothesis) => enrichHypothesis(hypothesis, false),
    );
  }

  async getById(userId: string, hypothesisId: string) {
    const workspaceId = await this.workspace(userId);
    const hypothesis = await (this.prisma.adHypothesis as any).findFirst({
      where: { id: hypothesisId, workspaceId },
      include: this.includeHypothesisCampaigns(),
    });
    if (!hypothesis) throw new NotFoundException('Ad hypothesis not found');
    return enrichHypothesis(hypothesis, true);
  }

  async create(userId: string, dto: CreateAdHypothesisDto) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const telegramChannel = await this.validateTelegramChannel(
      workspaceId,
      dto.telegramChannelId,
    );
    const { uniqueIds, campaigns } = await this.validateCampaigns(
      workspaceId,
      dto.adCampaignIds,
    );
    if (
      campaigns.some(
        (campaign: any) => campaign.telegramChannelId !== telegramChannel.id,
      )
    ) {
      throw new BadRequestException(
        'All selected campaigns must belong to the selected Telegram channel',
      );
    }
    const hypothesis = await (this.prisma.adHypothesis as any).create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: this.normalizeStatus(dto.status),
        conclusion: dto.conclusion?.trim() || null,
        iconId: dto.iconId?.trim() || null,
        telegramChannelId: telegramChannel.id,
        assignedMemberId,
        createdByUserId: userId,
        campaigns: {
          create: uniqueIds.map((adCampaignId) => ({
            workspaceId,
            adCampaignId,
          })),
        },
      },
    });
    return this.getById(userId, hypothesis.id);
  }

  async update(
    userId: string,
    hypothesisId: string,
    dto: UpdateAdHypothesisDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await (this.prisma.adHypothesis as any).findFirst({
      where: { id: hypothesisId, workspaceId },
      select: { id: true, telegramChannelId: true },
    });
    if (!existing) throw new NotFoundException('Ad hypothesis not found');
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    const nextTelegramChannelId =
      dto.telegramChannelId === undefined
        ? existing.telegramChannelId
        : (
            await this.validateTelegramChannel(
              workspaceId,
              dto.telegramChannelId,
            )
          ).id;

    const validatedCampaigns = dto.adCampaignIds
      ? await this.validateCampaigns(workspaceId, dto.adCampaignIds)
      : null;
    const uniqueIds = validatedCampaigns?.uniqueIds ?? null;
    if (
      validatedCampaigns?.campaigns.some(
        (campaign: any) => campaign.telegramChannelId !== nextTelegramChannelId,
      )
    ) {
      throw new BadRequestException(
        'All selected campaigns must belong to the selected Telegram channel',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await (tx.adHypothesis as any).update({
        where: { id: hypothesisId },
        data: {
          name: dto.name === undefined ? undefined : dto.name.trim(),
          description:
            dto.description === undefined
              ? undefined
              : dto.description?.trim() || null,
          status:
            dto.status === undefined
              ? undefined
              : this.normalizeStatus(dto.status),
          conclusion:
            dto.conclusion === undefined
              ? undefined
              : dto.conclusion?.trim() || null,
          iconId:
            dto.iconId === undefined ? undefined : dto.iconId?.trim() || null,
          telegramChannelId:
            dto.telegramChannelId === undefined
              ? undefined
              : nextTelegramChannelId,
          assignedMemberId,
        },
      });
      if (uniqueIds) {
        await (tx.adHypothesisCampaign as any).deleteMany({
          where: { hypothesisId, workspaceId },
        });
        await (tx.adHypothesisCampaign as any).createMany({
          data: uniqueIds.map((adCampaignId) => ({
            workspaceId,
            hypothesisId,
            adCampaignId,
          })),
        });
      }
    });

    return this.getById(userId, hypothesisId);
  }

  async remove(userId: string, hypothesisId: string) {
    const workspaceId = await this.workspace(userId);
    const existing = await (this.prisma.adHypothesis as any).findFirst({
      where: { id: hypothesisId, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Ad hypothesis not found');
    await (this.prisma.adHypothesis as any).delete({
      where: { id: hypothesisId },
    });
    return { success: true };
  }

  async getHypothesisSummary(userId: string, hypothesisId: string) {
    const hypothesis = await this.getById(userId, hypothesisId);
    return hypothesis.summary;
  }

  async inviteLinkHistory(userId: string, hypothesisId: string) {
    const workspaceId = await this.workspace(userId);
    const hypothesis =
      (await this.systemHypothesesService.resolveInviteLinkHistoryScope(
        workspaceId,
        hypothesisId,
      )) ?? ((await this.getById(userId, hypothesisId)) as any);
    const campaignIds = (hypothesis.campaigns || []).map(
      (campaign: any) => campaign.id,
    );
    const rowsAsc = campaignIds.length
      ? await this.prisma.telegramInviteLinkSnapshot.findMany({
          where: {
            workspaceId,
            adCampaignId: { in: campaignIds },
          },
          orderBy: [{ syncedAt: 'asc' }, { inviteLinkId: 'asc' }],
          select: {
            adCampaignId: true,
            inviteLinkId: true,
            syncedAt: true,
            joinedCount: true,
            requestedCount: true,
            isRevoked: true,
          },
        })
      : [];
    return buildHypothesisInviteLinkHistoryPayload(
      {
        id: hypothesis.id,
        name: hypothesis.name,
        campaigns: (hypothesis.campaigns || []).map((campaign: any) => ({
          id: campaign.id,
          telegramChannelId: campaign.telegramChannelId,
          inviteLinks: Array.isArray(campaign.inviteLinks)
            ? campaign.inviteLinks
            : [],
        })),
      },
      rowsAsc.filter(hasBothInviteCounters),
    );
  }
}
