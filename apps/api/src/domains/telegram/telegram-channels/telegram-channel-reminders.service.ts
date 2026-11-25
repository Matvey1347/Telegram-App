import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  PublicationNotificationPreview,
  PublicationNotificationSettings,
  PublicationNotificationSettingsView,
} from '@telegram-system/shared';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  autopilotReportLines,
  coverageNotificationLines,
  publicationNotificationChannel,
  publicationNotificationChannelSelect,
} from '../../operations/notifications/publication-notification-message';
import { publicationConfirmationLines } from '../telegram-system-bot/telegram-system-bot-publication-confirmation';

type ConfirmationFields = 'scheduledConfirmationDestination' | 'publishedConfirmationDestination';
type SettingsInput = Omit<PublicationNotificationSettings, ConfirmationFields> &
  Partial<Pick<PublicationNotificationSettings, ConfirmationFields>>;

export const CHANNEL_REMINDERS_TASK_KEY = 'telegram.channel_reminders.due';
export const activePublicationChannels = {
  isActive: true,
  archivedAt: null,
} as const;
const settingsSelect = {
  publicationNotificationsEnabled: true,
  coverageNotificationDestination: true,
  autopilotNotificationDestination: true,
  autopilotErrorNotificationDestination: true,
  scheduledConfirmationDestination: true,
  publishedConfirmationDestination: true,
  publicationNotificationExcludedChannelIds: true,
} as const;

@Injectable()
export class TelegramChannelRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  private async editor(userId: string) {
    return (
      await this.workspace.requireWorkspaceRole(userId, [
        WorkspaceRole.owner,
        WorkspaceRole.admin,
      ])
    ).workspaceId;
  }

  private async read(
    workspaceId: string,
  ): Promise<PublicationNotificationSettingsView> {
    const [settings, rows] = await Promise.all([
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: settingsSelect,
      }),
      this.prisma.telegramChannel.findMany({
        where: { workspaceId, ...activePublicationChannels },
        select: publicationNotificationChannelSelect,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const channels = rows.map((row) => {
      const { id, title, iconPresentation } =
        publicationNotificationChannel(row);
      return { id, title, iconPresentation };
    });
    const active = new Set(channels.map(({ id }) => id));
    return {
      enabled: settings.publicationNotificationsEnabled,
      coverageDestination: settings.coverageNotificationDestination,
      autopilotDestination: settings.autopilotNotificationDestination,
      autopilotErrorDestination: settings.autopilotErrorNotificationDestination,
      scheduledConfirmationDestination: settings.scheduledConfirmationDestination,
      publishedConfirmationDestination: settings.publishedConfirmationDestination,
      excludedChannelIds:
        settings.publicationNotificationExcludedChannelIds.filter((id) =>
          active.has(id),
        ),
      channels,
    };
  }

  async settings(userId: string) {
    return this.read(await this.editor(userId));
  }

  async save(userId: string, input: SettingsInput) {
    const workspaceId = await this.editor(userId);
    const current = await this.read(workspaceId);
    const available = new Set(current.channels.map(({ id }) => id));
    if (input.excludedChannelIds.some((id) => !available.has(id))) {
      throw new BadRequestException(
        'Publication notification channel is unavailable',
      );
    }
    const excludedChannelIds = [...input.excludedChannelIds].sort();
    const confirmationRoutes = {
      scheduledConfirmationDestination: input.scheduledConfirmationDestination ?? current.scheduledConfirmationDestination,
      publishedConfirmationDestination: input.publishedConfirmationDestination ?? current.publishedConfirmationDestination,
    };
    const changed =
      input.enabled !== current.enabled ||
      excludedChannelIds.join() !==
        [...current.excludedChannelIds].sort().join();
    const routingChanged =
      input.coverageDestination !== current.coverageDestination ||
      input.autopilotDestination !== current.autopilotDestination ||
      input.autopilotErrorDestination !== current.autopilotErrorDestination ||
      confirmationRoutes.scheduledConfirmationDestination !== current.scheduledConfirmationDestination ||
      confirmationRoutes.publishedConfirmationDestination !== current.publishedConfirmationDestination;
    if (changed || routingChanged) {
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          publicationNotificationsEnabled: input.enabled,
          publicationNotificationExcludedChannelIds: excludedChannelIds,
          coverageNotificationDestination: input.coverageDestination,
          autopilotNotificationDestination: input.autopilotDestination,
          autopilotErrorNotificationDestination:
            input.autopilotErrorDestination,
          ...confirmationRoutes,
          ...(changed
            ? {
                publicationNotificationDueAt: input.enabled ? new Date() : null,
              }
            : {}),
        },
      });
      if (changed)
        notifyScheduledTaskDueWorkChanged(CHANNEL_REMINDERS_TASK_KEY);
    }
    return { ...input, ...confirmationRoutes, excludedChannelIds, channels: current.channels };
  }

  async preview(
    userId: string,
    id?: string,
  ): Promise<PublicationNotificationPreview> {
    const workspaceId = await this.editor(userId);
    const [row, workspace] = await Promise.all([
      id ? this.prisma.telegramChannel.findFirst({
          where: { id, workspaceId, ...activePublicationChannels },
          select: publicationNotificationChannelSelect,
        }) : null,
      this.prisma.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: { timezone: true },
      }),
    ]);
    if (id && !row) throw new NotFoundException('Channel is unavailable');
    const channel = publicationNotificationChannel(
      row ?? { id: '', title: 'Пример канала' },
    );
    const sample = {
      generated: 30,
      scheduled: 12,
      coverageDays: 18,
      readyDrafts: 75,
      totalCost: '0.22',
      errorCount: 0,
    };
    const confirmation = {
      channels: [row ?? { id: '', title: 'Канал для прикладу' }],
      timezone: workspace.timezone,
      groups: [
        {
          title: 'Зразок публікації',
          placements: [{
            telegramChannelId: row?.id ?? '',
            scheduledAt: '2026-01-15T08:00:00.000Z',
            publishedAt: '2026-01-15T08:00:04.000Z',
            formatLabel: 'Автовидалення через 24 години',
            telegramMessageUrls: [''],
          }],
        },
      ],
    };
    return {
      scheduledConfirmation: publicationConfirmationLines({ ...confirmation, state: 'scheduled' }),
      publishedConfirmation: publicationConfirmationLines({ ...confirmation, state: 'published' }),
      coverage: coverageNotificationLines(3, [channel]),
      autopilot: autopilotReportLines(channel, sample),
      autopilotError: autopilotReportLines(channel, {
        ...sample,
        generated: 24,
        errorCount: 6,
        costBreakdown: {
          successful: '0.16', failed: '0.05', shared: '0.01',
          unknownByBucket: { successful: 0, failed: 0, shared: 0 },
        },
      }),
    };
  }
}
