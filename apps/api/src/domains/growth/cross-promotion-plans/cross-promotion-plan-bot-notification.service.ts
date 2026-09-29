import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { TelegramSystemBotNotificationsService } from '../../telegram/telegram-system-bot/telegram-system-bot-notifications.service';

type Placement = {
  telegramChannelId: string;
  scheduledAt: string;
  deleteAt?: string | null;
};

const json = <T>(value: unknown, fallback: T): T =>
  value && typeof value === 'object' ? (value as T) : fallback;

@Injectable()
export class CrossPromotionPlanBotNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    private readonly notifications: TelegramSystemBotNotificationsService,
  ) {}

  async send(userId: string, id: string) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const plan = await this.prisma.crossPromotionPlan.findFirst({
      where: { id, workspaceId },
      select: {
        title: true,
        partnerChannelIds: true,
        publisherChannelIds: true,
        publicationPost: true,
      },
    });
    if (!plan) throw new NotFoundException('Cross-promotion plan not found');
    const post = json<{ publisherPlacements?: Placement[] }>(
      plan.publicationPost,
      {},
    );
    const placements = post.publisherPlacements ?? [];
    if (!placements.length) {
      throw new BadRequestException('This promotion has no scheduled channels');
    }
    const channelIds = [...new Set([
      ...plan.partnerChannelIds,
      ...plan.publisherChannelIds,
    ])];
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: channelIds } },
      select: {
        id: true,
        title: true,
        presentationIcon: { select: { emoji: true } },
      },
    });
    const byId = new Map(channels.map((channel) => [channel.id, channel]));
    const format = new Intl.DateTimeFormat('uk-UA', {
      timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: '2-digit', hour12: false,
    });
    const lineFor = (placement: Placement) => {
      const channel = byId.get(placement.telegramChannelId);
      const icon = channel?.presentationIcon?.emoji || '📢';
      const scheduled = new Date(placement.scheduledAt);
      const deleteAt = placement.deleteAt ? new Date(placement.deleteAt) : null;
      const deletion = deleteAt && deleteAt.getTime() > scheduled.getTime()
        ? `\n   Автовидалення: <b>через ${duration(deleteAt.getTime() - scheduled.getTime())}</b>`
        : '';
      return `${icon} <b>${escapeHtml(channel?.title ?? 'Недоступний канал')}</b> — <b>${format.format(scheduled).replace(',', '')}</b>${deletion}`;
    };
    const partnerNames = plan.partnerChannelIds
      .map((channelId) => byId.get(channelId))
      .filter(Boolean)
      .map((channel) => `${channel!.presentationIcon?.emoji || '📢'} ${escapeHtml(channel!.title)}`);
    const text = [
      '✅ <b>Пост заплановано</b>',
      '',
      `<b>ВП:</b> ${escapeHtml(plan.title)}`,
      ...(partnerNames.length ? ['', `<b>Канали партнера:</b> ${partnerNames.join(', ')}`] : []),
      '',
      '<b>Пост буде опубліковано в моїх каналах:</b>',
      ...placements.map(lineFor),
    ].join('\n');
    return this.notifications.sendToWorkspaceUser({
      workspaceId,
      userId,
      text,
      parseMode: 'HTML',
    });
  }
}

function duration(milliseconds: number) {
  const minutes = Math.round(milliseconds / 60_000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} год ${remainingMinutes} хв`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[character]!,
  );
}
