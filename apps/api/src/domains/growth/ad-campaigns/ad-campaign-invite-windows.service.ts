import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramInviteLinkRegistrationService } from '../../telegram/telegram-channels/telegram-invite-link-registration.service';
import { zonedDateTimeToUtc } from '../../telegram/telegram-ad-sales/domain/timezone';
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
      select: { id: true, workspace: { select: { timezone: true } }, inviteLinks: { select: { id: true, url: true, telegramChannelId: true } } },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return { campaign, workspaceId };
  }

  async list(userId: string, campaignId: string) {
    await this.context(userId, campaignId);
    return this.prisma.adCampaignInviteLinkWindow.findMany({
      where: { adCampaignId: campaignId, inviteLink: { adCampaignId: campaignId } },
      select: { inviteLinkId: true, fromDate: true, timezone: true, joinedCount: true, pendingCount: true, computedAt: true },
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
        if (!entry.fromDate) {
          if (old) await tx.adCampaignInviteLinkWindow.delete({ where: { id: old.id } });
          continue;
        }
        if (old?.fromDate === entry.fromDate && old.timezone === timezone) continue;
        changed.push(entry.inviteLinkId);
        await tx.adCampaignInviteLinkWindow.upsert({
          where: { adCampaignId_inviteLinkId: { adCampaignId: campaignId, inviteLinkId: entry.inviteLinkId } },
          create: { adCampaignId: campaignId, inviteLinkId: entry.inviteLinkId, fromDate: entry.fromDate, timezone },
          update: { fromDate: entry.fromDate, timezone, joinedCount: null, pendingCount: null, computedAt: null },
        });
      }
    });
    const failed = await this.refresh(userId, campaignId, changed);
    return { windows: await this.list(userId, campaignId), failed };
  }

  async refresh(userId: string, campaignId: string, onlyIds?: string[]) {
    const { campaign } = await this.context(userId, campaignId);
    const windows = await this.list(userId, campaignId);
    const byLink = new Map(campaign.inviteLinks.map((link) => [link.id, link]));
    const failed: string[] = [];
    for (const window of windows) {
      if (onlyIds && !onlyIds.includes(window.inviteLinkId)) continue;
      const link = byLink.get(window.inviteLinkId);
      if (!link) continue;
      try {
        const from = zonedDateTimeToUtc(window.fromDate, '00:00', window.timezone);
        const result = await this.registration.register(userId, link.telegramChannelId, link.url, { from, until: new Date(), includePending: true });
        if (result.joinedWithinPeriod == null || result.pendingWithinPeriod == null) throw new Error('Incomplete Telegram data');
        await this.prisma.adCampaignInviteLinkWindow.updateMany({
          where: { adCampaignId: campaignId, inviteLinkId: link.id, fromDate: window.fromDate, timezone: window.timezone, inviteLink: { adCampaignId: campaignId } },
          data: { joinedCount: result.joinedWithinPeriod, pendingCount: result.pendingWithinPeriod, computedAt: new Date() },
        });
      } catch {
        failed.push(link.id);
        await this.prisma.adCampaignInviteLinkWindow.updateMany({
          where: { adCampaignId: campaignId, inviteLinkId: link.id, fromDate: window.fromDate, timezone: window.timezone },
          data: { joinedCount: null, pendingCount: null, computedAt: null },
        });
      }
    }
    return failed;
  }
}
