import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramAdPlacementStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { TelegramSystemBotNotificationsService } from '../telegram-system-bot/telegram-system-bot-notifications.service';
import { renderPublicationConfirmation } from '../telegram-system-bot/telegram-system-bot-publication-confirmation';

@Injectable()
export class TelegramAdSaleBotNotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
    @Inject(forwardRef(() => TelegramSystemBotNotificationsService))
    private readonly notifications: TelegramSystemBotNotificationsService,
  ) {}

  async preview(userId: string, saleId: string) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    return this.messageFor(workspaceId, saleId);
  }

  async send(userId: string, saleId: string) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const message = await this.messageFor(workspaceId, saleId);
    return this.notifications.sendToWorkspaceUser({
      workspaceId,
      userId,
      text: message.text,
      parseMode: 'HTML',
    });
  }

  async sendScheduledOnce(userId: string, saleId: string) {
    const workspaceId = await this.workspaces.resolveWorkspaceIdForUser(userId);
    const sale = await this.sale(workspaceId, saleId);
    if (
      sale.scheduledBotConfirmationSentAt ||
      !isFullyScheduled(sale.placements)
    )
      return;
    const message = this.render(sale, 'scheduled');
    const delivery = await this.notifications.sendToWorkspaceUser({
      workspaceId,
      userId,
      text: message,
      parseMode: 'HTML',
    });
    if (delivery.status !== 'SENT') return;
    await this.prisma.telegramAdSale.update({
      where: { id: saleId },
      data: { scheduledBotConfirmationSentAt: new Date() },
    });
  }

  async sendPublishedOnce(saleId: string) {
    const sale = await this.prisma.telegramAdSale.findUnique({
      where: { id: saleId },
      select: {
        workspaceId: true,
        createdByUserId: true,
        publishedBotConfirmationSentAt: true,
      },
    });
    if (!sale?.createdByUserId || sale.publishedBotConfirmationSentAt) return;
    const detail = await this.sale(sale.workspaceId, saleId);
    if (!isFullyPublished(detail.placements)) return;
    const message = this.render(detail, 'published');
    const delivery = await this.notifications.sendToWorkspaceUser({
      workspaceId: sale.workspaceId,
      userId: sale.createdByUserId,
      text: message,
      parseMode: 'HTML',
    });
    if (delivery.status !== 'SENT') return;
    await this.prisma.telegramAdSale.update({
      where: { id: saleId },
      data: { publishedBotConfirmationSentAt: new Date() },
    });
  }

  private async messageFor(workspaceId: string, saleId: string) {
    const sale = await this.sale(workspaceId, saleId);
    if (!sale.placements.length)
      throw new BadRequestException('This deal has no scheduled channels');
    return {
      text: this.render(
        sale,
        isFullyPublished(sale.placements) ? 'published' : 'scheduled',
      ),
    };
  }

  private sale(workspaceId: string, id: string) {
    return this.prisma.telegramAdSale
      .findFirst({
        where: { id, workspaceId },
        select: {
          title: true,
          scheduledBotConfirmationSentAt: true,
          workspace: { select: { timezone: true } },
          placements: {
            orderBy: { scheduledAt: 'asc' },
            select: {
              status: true,
              scheduledAt: true,
              plannedDeleteAt: true,
              telegramChannelId: true,
              managedPost: {
                select: {
                  status: true,
                  title: true,
                  telegramMessageUrls: true,
                },
              },
              telegramChannel: {
                select: {
                  id: true,
                  title: true,
                  publicInviteLink: { select: { url: true } },
                  defaultInviteLink: { select: { url: true } },
                  presentationIcon: { select: { emoji: true } },
                },
              },
            },
          },
        },
      })
      .then((sale) => {
        if (!sale) throw new NotFoundException('Telegram ad sale not found');
        return sale;
      });
  }

  private render(
    sale: Awaited<ReturnType<TelegramAdSaleBotNotificationService['sale']>>,
    state: 'scheduled' | 'published',
  ) {
    const groups = new Map<string, typeof sale.placements>();
    for (const placement of sale.placements) {
      const title =
        placement.managedPost?.title.trim() ||
        sale.title?.trim() ||
        'Рекламний пост';
      groups.set(title, [...(groups.get(title) ?? []), placement]);
    }
    return renderPublicationConfirmation({
      state,
      timezone: sale.workspace.timezone,
      channels: sale.placements.map((placement) => placement.telegramChannel),
      groups: [...groups].map(([title, placements]) => ({
        title,
        placements: placements.map((placement) => ({
          telegramChannelId: placement.telegramChannelId,
          scheduledAt: placement.scheduledAt,
          deleteAt: placement.plannedDeleteAt,
          telegramMessageUrls: placement.managedPost?.telegramMessageUrls ?? [],
        })),
      })),
    });
  }
}

function isFullyScheduled(
  placements: Array<{
    status: TelegramAdPlacementStatus;
    managedPost: { status: TelegramManagedPostStatus } | null;
  }>,
) {
  return (
    placements.length > 0 &&
    placements.every(
      (placement) =>
        placement.managedPost &&
        (placement.status === TelegramAdPlacementStatus.SCHEDULED ||
          placement.status === TelegramAdPlacementStatus.PUBLISHED ||
          placement.status === TelegramAdPlacementStatus.COMPLETED),
    )
  );
}

function isFullyPublished(
  placements: Array<{
    status: TelegramAdPlacementStatus;
    managedPost: { status: TelegramManagedPostStatus } | null;
  }>,
) {
  return (
    placements.length > 0 &&
    placements.every(
      (placement) =>
        placement.status === TelegramAdPlacementStatus.PUBLISHED ||
        placement.status === TelegramAdPlacementStatus.COMPLETED ||
        placement.managedPost?.status === TelegramManagedPostStatus.PUBLISHED,
    )
  );
}
