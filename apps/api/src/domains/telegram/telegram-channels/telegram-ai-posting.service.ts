import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';

const defaults = {
  language: '',
  topic: '',
  audience: '',
  style: '',
  instructions: '',
  historyMode: 'all',
  historyFrom: '',
  sources: [],
  categories: [],
  formats: [],
  suggestCategories: true,
  variedLength: true,
  variedFormats: true,
  ending: '',
  hashtags: 'disabled',
  imageMode: 'found',
};

@Injectable()
export class TelegramAiPostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  private async owned(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: { id: true, language: true, niche: true, shortDescription: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return { workspaceId, channel };
  }

  async get(userId: string, channelId: string) {
    const { workspaceId, channel } = await this.owned(userId, channelId);
    const saved = await this.prisma.telegramAiPostingSettings.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
    });
    return {
      channel,
      detectedLanguage: channel.language ?? '',
      configuration: {
        ...defaults,
        ...((saved?.configuration as object) ?? {}),
        language: (saved?.configuration as any)?.language ?? '',
        topic: (saved?.configuration as any)?.topic || channel.niche || '',
        audience:
          (saved?.configuration as any)?.audience ||
          channel.shortDescription ||
          '',
      },
      autopilotEnabled: saved?.autopilotEnabled ?? false,
      autopilot: saved
        ? {
            postsPerDay: saved.postsPerDay,
            targetReadyDrafts: saved.targetReadyDrafts,
            maxReadyDrafts: saved.maxReadyDrafts,
            targetCoverageDays: saved.targetCoverageDays,
            criticalCoverageDays: saved.criticalCoverageDays,
            nextRunAt: saved.autopilotNextRunAt,
            aiDailyBudget: saved.aiDailyBudget?.toString() ?? '',
            aiMonthlyBudget: saved.aiMonthlyBudget?.toString() ?? '',
            lastRunAt: saved.autopilotLastRunAt,
            lastStatus: saved.autopilotLastStatus,
            lastError: saved.autopilotLastError,
            lastSummary: saved.autopilotLastSummary,
          }
        : {
            postsPerDay: 4,
            targetReadyDrafts: 50,
            maxReadyDrafts: 100,
            targetCoverageDays: 14,
            criticalCoverageDays: 7,
            aiDailyBudget: '',
            aiMonthlyBudget: '',
          },
      configured: Boolean(saved),
      configurationVersion: saved?.configurationVersion ?? 1,
    };
  }

  async sourceChannels(userId: string, channelId: string) {
    const { workspaceId } = await this.owned(userId, channelId);
    return this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        isActive: true,
        id: { not: channelId },
        adminLinks: { some: {} },
      },
      select: { id: true, title: true, username: true, photoUrl: true },
      orderBy: { title: 'asc' },
      take: 250,
    });
  }

  async save(
    userId: string,
    channelId: string,
    input: {
      configuration: Record<string, unknown>;
      autopilotEnabled?: boolean;
      postsPerDay?: number;
      targetReadyDrafts?: number;
      maxReadyDrafts?: number;
      targetCoverageDays?: number;
      criticalCoverageDays?: number;
      aiDailyBudget?: string | null;
      aiMonthlyBudget?: string | null;
    },
  ) {
    const { workspaceId } = await this.owned(userId, channelId);
    const configuration = input.configuration;
    if (!['all', 'since', 'none'].includes(String(configuration.historyMode)))
      throw new BadRequestException('Invalid history mode');
    if (
      configuration.historyMode === 'since' &&
      (typeof configuration.historyFrom !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(configuration.historyFrom))
    )
      throw new BadRequestException('A valid history date is required');
    if (!['disabled', 'start', 'end'].includes(String(configuration.hashtags)))
      throw new BadRequestException('Invalid hashtag placement');
    if (!['found', 'ai', 'hybrid'].includes(String(configuration.imageMode)))
      throw new BadRequestException('Invalid image mode');
    if (
      !Array.isArray(configuration.sources) ||
      configuration.sources.length > 5 ||
      !Array.isArray(configuration.categories) ||
      !Array.isArray(configuration.formats)
    )
      throw new BadRequestException(
        'Sources, categories and formats must be lists',
      );
    const existingLimits =
      await this.prisma.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        select: {
          postsPerDay: true,
          targetReadyDrafts: true,
          maxReadyDrafts: true,
          targetCoverageDays: true,
          criticalCoverageDays: true,
          aiDailyBudget: true,
          aiMonthlyBudget: true,
        },
      });
    const limits = {
      postsPerDay: input.postsPerDay ?? existingLimits?.postsPerDay ?? 4,
      targetReadyDrafts:
        input.targetReadyDrafts ?? existingLimits?.targetReadyDrafts ?? 50,
      maxReadyDrafts:
        input.maxReadyDrafts ?? existingLimits?.maxReadyDrafts ?? 100,
      targetCoverageDays:
        input.targetCoverageDays ?? existingLimits?.targetCoverageDays ?? 14,
      criticalCoverageDays:
        input.criticalCoverageDays ?? existingLimits?.criticalCoverageDays ?? 7,
    };
    if (
      limits.postsPerDay < 1 ||
      limits.postsPerDay > 20 ||
      limits.targetReadyDrafts < 0 ||
      limits.maxReadyDrafts < limits.targetReadyDrafts ||
      limits.maxReadyDrafts > 500 ||
      limits.targetCoverageDays < 1 ||
      limits.targetCoverageDays > 62 ||
      limits.criticalCoverageDays < 1 ||
      limits.criticalCoverageDays > limits.targetCoverageDays
    )
      throw new BadRequestException('Invalid autopilot limits');
    const budget = (value: string | null | undefined, fallback: unknown) => {
      const resolved = value === undefined ? fallback : value;
      if (resolved === null || resolved === undefined || resolved === '')
        return null;
      if (
        typeof resolved !== 'string' ||
        !/^(0|[1-9]\d{0,6})(\.\d{1,12})?$/.test(resolved)
      )
        throw new BadRequestException('Invalid AI Posting budget');
      return resolved;
    };
    const budgets = {
      aiDailyBudget: budget(
        input.aiDailyBudget,
        existingLimits?.aiDailyBudget?.toString(),
      ),
      aiMonthlyBudget: budget(
        input.aiMonthlyBudget,
        existingLimits?.aiMonthlyBudget?.toString(),
      ),
    };
    return this.prisma.telegramAiPostingSettings.upsert({
      where: { telegramChannelId: channelId },
      create: {
        workspaceId,
        telegramChannelId: channelId,
        configuration: configuration as any,
        autopilotEnabled: false,
        ...limits,
        ...budgets,
      },
      update: {
        configuration: configuration as any,
        configurationVersion: { increment: 1 },
        ...limits,
        ...budgets,
        ...(input.autopilotEnabled === undefined
          ? {}
          : { autopilotEnabled: input.autopilotEnabled }),
      },
      select: {
        configuration: true,
        configurationVersion: true,
        autopilotEnabled: true,
        updatedAt: true,
      },
    });
  }

  async checkSource(userId: string, channelId: string, sourceId: string) {
    const { workspaceId } = await this.owned(userId, channelId);
    const settings = await this.prisma.telegramAiPostingSettings.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      select: { configuration: true },
    });
    const sources = (settings?.configuration as any)?.sources;
    const source = Array.isArray(sources)
      ? sources.find((item: any) => item.id === sourceId)
      : null;
    if (!source) throw new NotFoundException('AI Posting source not found');
    if (source.type === 'website' || source.type === 'rss') {
      try {
        const url = new URL(String(source.value));
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error();
      } catch {
        return { ok: false, message: 'Enter a valid HTTP or HTTPS URL.' };
      }
    }
    if (source.type === 'telegram') {
      const available = await this.prisma.telegramChannel.findFirst({
        where: {
          id: source.value,
          workspaceId,
          isActive: true,
          NOT: { id: channelId },
        },
        select: { id: true },
      });
      if (!available)
        return {
          ok: false,
          message: 'Telegram-канал недоступен в этом рабочем пространстве.',
        };
    }
    return { ok: true, message: 'Source settings look valid.' };
  }

  async startAutopilot(
    userId: string,
    channelId: string,
    values: Partial<{
      postsPerDay: number;
      targetReadyDrafts: number;
      maxReadyDrafts: number;
      targetCoverageDays: number;
      criticalCoverageDays: number;
    }> = {},
  ) {
    const { workspaceId } = await this.owned(userId, channelId);
    const current = await this.prisma.telegramAiPostingSettings.findUnique({
      where: { telegramChannelId: channelId },
      select: {
        postsPerDay: true,
        targetReadyDrafts: true,
        maxReadyDrafts: true,
        targetCoverageDays: true,
        criticalCoverageDays: true,
      },
    });
    const settings = {
      postsPerDay: values.postsPerDay ?? current?.postsPerDay ?? 4,
      targetReadyDrafts:
        values.targetReadyDrafts ?? current?.targetReadyDrafts ?? 50,
      maxReadyDrafts: values.maxReadyDrafts ?? current?.maxReadyDrafts ?? 100,
      targetCoverageDays:
        values.targetCoverageDays ?? current?.targetCoverageDays ?? 14,
      criticalCoverageDays:
        values.criticalCoverageDays ?? current?.criticalCoverageDays ?? 7,
    };
    if (
      settings.postsPerDay < 1 ||
      settings.postsPerDay > 20 ||
      settings.targetReadyDrafts < 0 ||
      settings.maxReadyDrafts < settings.targetReadyDrafts ||
      settings.maxReadyDrafts > 500 ||
      settings.targetCoverageDays < 1 ||
      settings.targetCoverageDays > 62 ||
      settings.criticalCoverageDays < 1 ||
      settings.criticalCoverageDays > settings.targetCoverageDays
    )
      throw new BadRequestException('Invalid autopilot limits');
    const saved = await this.prisma.telegramAiPostingSettings.upsert({
      where: { telegramChannelId: channelId },
      create: {
        workspaceId,
        telegramChannelId: channelId,
        configuration: defaults as any,
        ...settings,
        autopilotEnabled: true,
        autopilotNextRunAt: new Date(),
      },
      update: {
        ...settings,
        autopilotEnabled: true,
        autopilotNextRunAt: new Date(),
        autopilotLeaseOwner: null,
        autopilotLeaseExpiresAt: null,
      },
    });
    notifyScheduledTaskDueWorkChanged('telegram.ai_posting.autopilot');
    return { autopilotEnabled: saved.autopilotEnabled, autopilot: saved };
  }

  async stopAutopilot(userId: string, channelId: string) {
    const { workspaceId } = await this.owned(userId, channelId);
    const result = await this.prisma.telegramAiPostingSettings.updateMany({
      where: { workspaceId, telegramChannelId: channelId },
      data: {
        autopilotEnabled: false,
        autopilotNextRunAt: null,
        autopilotLeaseOwner: null,
        autopilotLeaseExpiresAt: null,
      },
    });
    notifyScheduledTaskDueWorkChanged('telegram.ai_posting.autopilot');
    return { autopilotEnabled: false, stopped: result.count > 0 };
  }
}
