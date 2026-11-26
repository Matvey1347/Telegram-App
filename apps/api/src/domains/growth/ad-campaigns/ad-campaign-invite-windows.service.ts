import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramInviteLinkRegistrationService } from '../../telegram/telegram-channels/telegram-invite-link-registration.service';
import { utcDateKey, zonedDateTimeToUtc } from '../../telegram/telegram-ad-sales/domain/timezone';
import { SetAdCampaignInviteWindowsDto } from './ad-campaign-invite-windows.dto';

@Injectable()
export class AdCampaignInviteWindowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly registration: TelegramInviteLinkRegistrationService,
  ) {}

  private async context(userId: string, campaignId: string) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const campaign = await this.prisma.adCampaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true, startedAt: true, placementDate: true, workspace: { select: { timezone: true } }, inviteLinks: { select: { id: true, url: true, telegramChannelId: true } } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return { campaign, workspaceId };
  }

  async list(userId: string, campaignId: string) {
    await this.context(userId, campaignId);
    return this.prisma.adCampaignInviteLinkWindow.findMany({
      where: { adCampaignId: campaignId, inviteLink: { adCampaignId: campaignId } },
      select: { inviteLinkId: true, fromDate: true, currentRequests: true, peakPendingCount: true, timezone: true, joinedCount: true, pendingCount: true, computedAt: true, lastAttemptAt: true, lastAttemptStatus: true, lastAttemptReason: true },
    });
  }

  async set(userId: string, campaignId: string, dto: SetAdCampaignInviteWindowsDto) {
    const { campaign } = await this.context(userId, campaignId);
    const linkIds = new Set(campaign.inviteLinks.map((link) => link.id));
    const unique = new Set(dto.windows.map((entry) => entry.inviteLinkId));
    if (unique.size !== dto.windows.length || dto.windows.some((entry) => !linkIds.has(entry.inviteLinkId))) {
      throw new BadRequestException('Invite links must belong to this campaign');
    }
    const timezone = campaign.workspace.timezone;
    const start = campaign.startedAt ?? campaign.placementDate;
    const campaignDate = start ? utcDateKey(start, timezone) : null;
    for (const entry of dto.windows) {
      if (!entry.fromDate) continue;
      const parsed = new Date(`${entry.fromDate}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== entry.fromDate) {
        throw new BadRequestException('Enter a valid start date');
      }
      zonedDateTimeToUtc(entry.fromDate, '00:00', timezone);
    }
    const current = await this.prisma.adCampaignInviteLinkWindow.findMany({ where: { adCampaignId: campaignId } });
    const byLink = new Map(current.map((item) => [item.inviteLinkId, item]));
    const changed: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.adCampaignInviteLinkWindow.deleteMany({ where: { adCampaignId: campaignId, inviteLinkId: { notIn: [...linkIds] } } });
      for (const entry of dto.windows) {
        const old = byLink.get(entry.inviteLinkId);
        if (!entry.fromDate && !entry.currentRequests) {
          if (old) await tx.adCampaignInviteLinkWindow.delete({ where: { id: old.id } });
          continue;
        }
        const fromDate = entry.fromDate && campaignDate && campaignDate > entry.fromDate
          ? campaignDate : entry.fromDate ?? null;
        const currentRequests = Boolean(entry.currentRequests);
        if (old?.fromDate === fromDate && old.timezone === timezone && old.currentRequests === currentRequests) continue;
        changed.push(entry.inviteLinkId);
        const configurationToken = randomUUID();
        await tx.adCampaignInviteLinkWindow.upsert({
          where: { adCampaignId_inviteLinkId: { adCampaignId: campaignId, inviteLinkId: entry.inviteLinkId } },
          create: { adCampaignId: campaignId, inviteLinkId: entry.inviteLinkId, fromDate, currentRequests, timezone, configurationToken },
          update: { fromDate, currentRequests, timezone, configurationToken, joinedCount: null, pendingCount: null, peakPendingCount: null, computedAt: null, lastAttemptAt: null, lastAttemptToken: null, lastAttemptStatus: null, lastAttemptReason: null },
        });
      }
    });
    const failed = await this.refresh(userId, campaignId, changed);
    return { windows: await this.list(userId, campaignId), failed };
  }

  async refresh(userId: string, campaignId: string, onlyIds?: string[]) {
    const { campaign } = await this.context(userId, campaignId);
    const windows = await this.prisma.adCampaignInviteLinkWindow.findMany({ where: { adCampaignId: campaignId } });
    const byLink = new Map(campaign.inviteLinks.map((link) => [link.id, link]));
    const failed: string[] = [];
    for (const window of windows) {
      if (onlyIds && !onlyIds.includes(window.inviteLinkId)) continue;
      const link = byLink.get(window.inviteLinkId);
      if (!link) continue;
      const start = campaign.startedAt ?? campaign.placementDate;
      const campaignDate = start ? utcDateKey(start, window.timezone) : null;
      const clamped = Boolean(window.fromDate && campaignDate && campaignDate > window.fromDate);
      const fromDate = clamped ? campaignDate! : window.fromDate;
      const observedUntil = new Date();
      const lastAttemptToken = randomUUID();
      const identity = {
        id: window.id,
        adCampaignId: campaignId,
        inviteLinkId: link.id,
        configurationToken: window.configurationToken,
        inviteLink: { adCampaignId: campaignId, url: link.url, telegramChannelId: link.telegramChannelId },
      };
      const reserved = await this.prisma.adCampaignInviteLinkWindow.updateMany({
        where: { ...identity, lastAttemptToken: window.lastAttemptToken },
        data: {
          ...(clamped ? { fromDate, joinedCount: null, pendingCount: null, peakPendingCount: null, computedAt: null } : {}),
          lastAttemptAt: observedUntil, lastAttemptToken, lastAttemptStatus: 'RUNNING', lastAttemptReason: null,
        },
      });
      if (reserved.count !== 1) continue;

      let joinedCount: number | null = null;
      let pendingCount: number | null = null;
      let reason: string | null = null;
      try {
        const localStart = fromDate ? zonedDateTimeToUtc(fromDate, '00:00', window.timezone) : null;
        const from = localStart && start && start > localStart ? start : localStart;
        const result = await this.registration.register(
          userId, link.telegramChannelId, link.url,
          from ? { from, until: observedUntil, includePending: !window.currentRequests } : undefined,
        );
        joinedCount = from ? result.joinedWithinPeriod : 0;
        pendingCount = (window.currentRequests ? result.currentRequestedCount : result.pendingWithinPeriod) ?? null;
        if (joinedCount == null || pendingCount == null) reason = 'INCOMPLETE_TELEGRAM_DATA';
      } catch {
        reason = 'TELEGRAM_REFRESH_FAILED';
      }
      const complete = joinedCount != null && pendingCount != null;
      const saved = await this.prisma.adCampaignInviteLinkWindow.updateMany({
        where: { ...identity, lastAttemptToken },
        data: {
          ...(joinedCount == null ? {} : { joinedCount }),
          ...(pendingCount == null ? {} : {
            pendingCount,
            peakPendingCount: Math.max(pendingCount, clamped ? 0 : window.peakPendingCount ?? window.pendingCount ?? 0),
          }),
          ...(complete ? { computedAt: observedUntil } : {}),
          lastAttemptStatus: complete ? 'SUCCESS' : joinedCount != null || pendingCount != null ? 'PARTIAL' : 'FAILED',
          lastAttemptReason: reason,
        },
      });
      if (saved.count === 1 && !complete) failed.push(link.id);
    }
    return failed;
  }
}
