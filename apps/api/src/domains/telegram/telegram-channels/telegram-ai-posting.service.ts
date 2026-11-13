import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import {
  isValidTelegramAiPostingSourceId,
  telegramAiPostingSourceWhere,
} from './telegram-ai-posting-source-policy';
import {
  detectTelegramAiPostingLanguage,
  telegramAiPostingLanguageName,
} from './telegram-ai-posting-language';
import { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';
import { writeTelegramAiPostingSettingsVersion } from './telegram-ai-posting-settings-version.store';

const defaults = {
  language: '',
  channelDescription: '',
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
  allowCreateHypotheses: false,
  allowCreateGroups: false,
  variedLength: true,
  variedFormats: true,
  emojiPolicy: 'contextual',
  ending: '',
  hashtags: 'disabled',
  imageMode: 'ai',
  imageStyles: [],
  imageReferenceUrls: [],
  useChannelAvatarInMedia: false,
};

function isInvalidChannelRule(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.id !== 'string' ||
    !rule.id.trim() ||
    typeof rule.text !== 'string' ||
    !rule.text.trim() ||
    rule.text.length > 1000 ||
    !['feedback', 'manual'].includes(String(rule.source)) ||
    typeof rule.active !== 'boolean' ||
    typeof rule.createdAt !== 'string' ||
    (rule.feedbackId !== undefined && typeof rule.feedbackId !== 'string')
  );
}

@Injectable()
export class TelegramAiPostingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    @Optional()
    private readonly sourceCollector?: TelegramAiPostingSourceService,
  ) {}

  private async owned(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
      select: {
        id: true,
        language: true,
        niche: true,
        shortDescription: true,
        photoUrl: true,
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return { workspaceId, channel };
  }

  async get(userId: string, channelId: string) {
    const { workspaceId, channel } = await this.owned(userId, channelId);
    const [saved, recentPosts] = await Promise.all([
      this.prisma.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
      }),
      telegramAiPostingLanguageName(channel.language)
        ? Promise.resolve([])
        : (this.prisma.telegramPost?.findMany({
            where: {
              workspaceId,
              telegramChannelId: channelId,
              OR: [{ text: { not: null } }, { formattedText: { not: null } }],
            },
            select: { text: true, formattedText: true },
            orderBy: { postDate: 'desc' },
            take: 30,
          }) ?? Promise.resolve([])),
    ]);
    const detectedLanguage =
      (telegramAiPostingLanguageName(channel.language)
        ? channel.language
        : '') || detectTelegramAiPostingLanguage(recentPosts ?? []);
    const stored =
      (saved?.configuration as Record<string, unknown> | null) ?? {};
    const storedText = (key: string) =>
      typeof stored[key] === 'string' ? stored[key] : '';
    const topic = storedText('topic') || channel.niche || '';
    const audience = storedText('audience') || channel.shortDescription || '';
    const channelDescription = Object.prototype.hasOwnProperty.call(
      stored,
      'channelDescription',
    )
      ? storedText('channelDescription')
      : [
          topic ? `Тематика: ${topic}` : '',
          audience ? `Аудитория: ${audience}` : '',
          storedText('style') ? `Стиль: ${storedText('style')}` : '',
          storedText('instructions')
            ? `Дополнительные пожелания: ${storedText('instructions')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n');
    return {
      channel,
      detectedLanguage,
      configuration: {
        ...defaults,
        ...stored,
        channelDescription,
        language: storedText('language'),
        topic,
        audience,
      },
      autopilotEnabled: saved?.autopilotEnabled ?? false,
      mode: saved?.mode ?? (saved?.autopilotEnabled ? 'AUTOPILOT' : 'TEST'),
      draftExpirationDays: saved?.draftExpirationDays ?? 30,
      autopilot: saved
        ? {
            postsPerDay: saved.postsPerDay,
            targetReadyDrafts: saved.targetReadyDrafts,
            maxReadyDrafts: saved.maxReadyDrafts,
            targetCoverageDays: saved.targetCoverageDays,
            criticalCoverageDays: saved.criticalCoverageDays,
            nextRunAt: saved.autopilotNextRunAt,
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
            aiMonthlyBudget: '',
          },
      configured: Boolean(saved),
      configurationVersion: saved?.configurationVersion ?? 1,
    };
  }

  async sourceChannels(userId: string, channelId: string) {
    const { workspaceId } = await this.owned(userId, channelId);
    return this.prisma.telegramChannel.findMany({
      where: telegramAiPostingSourceWhere(workspaceId, channelId),
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
      mode?: 'TEST' | 'REVIEW' | 'AUTOPILOT';
      draftExpirationDays?: number;
      aiMonthlyBudget?: string | null;
    },
  ) {
    const { workspaceId } = await this.owned(userId, channelId);
    const configuration = input.configuration;
    const postsPerDayMin = configuration.postsPerDayMin ?? 3;
    const postsPerDayMax = configuration.postsPerDayMax ?? 4;
    if (
      !Number.isInteger(postsPerDayMin) ||
      !Number.isInteger(postsPerDayMax) ||
      Number(postsPerDayMin) < 1 ||
      Number(postsPerDayMax) > 5 ||
      Number(postsPerDayMin) > Number(postsPerDayMax)
    )
      throw new BadRequestException('Invalid daily generation range');
    if (
      input.mode !== undefined &&
      !['TEST', 'REVIEW', 'AUTOPILOT'].includes(input.mode)
    )
      throw new BadRequestException('Invalid AI Posting mode');
    const draftExpirationDaysInput = input.draftExpirationDays;
    if (
      draftExpirationDaysInput !== undefined &&
      (!Number.isInteger(draftExpirationDaysInput) ||
        draftExpirationDaysInput < 1 ||
        draftExpirationDaysInput > 365)
    )
      throw new BadRequestException('Invalid draft expiration');
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
      configuration.imageStyles !== undefined &&
      (!Array.isArray(configuration.imageStyles) ||
        configuration.imageStyles.length > 10 ||
        configuration.imageStyles.some(
          (style) =>
            typeof style !== 'string' || !style.trim() || style.length > 500,
        ))
    )
      throw new BadRequestException('Invalid image preferences');
    if (
      configuration.mediaPreferences !== undefined &&
      (!Array.isArray(configuration.mediaPreferences) ||
        configuration.mediaPreferences.length > 10 ||
        configuration.mediaPreferences.some((value) => {
          if (!value || typeof value !== 'object' || Array.isArray(value))
            return true;
          const preference = value as Record<string, unknown>;
          if (
            typeof preference.id !== 'string' ||
            preference.id.length > 100 ||
            typeof preference.name !== 'string' ||
            !preference.name.trim() ||
            preference.name.length > 80 ||
            typeof preference.description !== 'string' ||
            preference.description.length > 500 ||
            typeof preference.emoji !== 'string' ||
            preference.emoji.length > 16 ||
            (preference.emojiIconId !== undefined &&
              (typeof preference.emojiIconId !== 'string' ||
                preference.emojiIconId.length > 100)) ||
            !Array.isArray(preference.references) ||
            preference.references.length > 4
          )
            return true;
          return preference.references.some((value) => {
            if (typeof value !== 'string' || value.length > 2000) return true;
            try {
              const url = new URL(value);
              return (
                !['http:', 'https:'].includes(url.protocol) ||
                Boolean(url.username || url.password)
              );
            } catch {
              return true;
            }
          });
        }))
    )
      throw new BadRequestException('Invalid image preferences');
    if (
      configuration.imageReferenceUrls !== undefined &&
      (!Array.isArray(configuration.imageReferenceUrls) ||
        configuration.imageReferenceUrls.length > 4 ||
        configuration.imageReferenceUrls.some((value) => {
          if (typeof value !== 'string' || value.length > 2000) return true;
          try {
            const url = new URL(value);
            return (
              !['http:', 'https:'].includes(url.protocol) ||
              Boolean(url.username || url.password)
            );
          } catch {
            return true;
          }
        }))
    )
      throw new BadRequestException('Invalid image references');
    if (
      configuration.useChannelAvatarInMedia !== undefined &&
      typeof configuration.useChannelAvatarInMedia !== 'boolean'
    )
      throw new BadRequestException('Invalid channel avatar media option');
    if (
      !Array.isArray(configuration.sources) ||
      !Array.isArray(configuration.categories) ||
      !Array.isArray(configuration.formats)
    )
      throw new BadRequestException(
        'Sources, categories and formats must be lists',
      );
    const rules = configuration.rules ?? [];
    if (
      !Array.isArray(rules) ||
      rules.length > 100 ||
      rules.some(isInvalidChannelRule)
    )
      throw new BadRequestException('Invalid channel rules');
    const cleanedSources = await this.cleanUnavailableSources(
      workspaceId,
      channelId,
      configuration.sources,
    );
    const configurationToSave = {
      ...configuration,
      sources: cleanedSources.sources,
      rules,
    };
    const existingLimits =
      await this.prisma.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        select: {
          postsPerDay: true,
          targetReadyDrafts: true,
          maxReadyDrafts: true,
          targetCoverageDays: true,
          criticalCoverageDays: true,
          draftExpirationDays: true,
          aiMonthlyBudget: true,
        },
      });
    const draftExpirationDays =
      draftExpirationDaysInput ?? existingLimits?.draftExpirationDays ?? 30;
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
      // AI Posting has no channel-level daily USD cap. Clear legacy values so
      // they cannot continue to appear or be enforced by older call paths.
      aiDailyBudget: null,
      aiMonthlyBudget: budget(
        input.aiMonthlyBudget,
        existingLimits?.aiMonthlyBudget?.toString(),
      ),
    };
    const saved = await this.prisma.$transaction(async (tx) => {
      const result = await tx.telegramAiPostingSettings.upsert({
        where: { telegramChannelId: channelId },
        create: {
          workspaceId,
          telegramChannelId: channelId,
          configuration: configurationToSave as Prisma.InputJsonObject,
          autopilotEnabled: input.mode !== undefined && input.mode !== 'TEST',
          mode: input.mode ?? 'TEST',
          draftExpirationDays,
          ...limits,
          ...budgets,
        },
        update: {
          configuration: configurationToSave as Prisma.InputJsonObject,
          configurationVersion: { increment: 1 },
          ...limits,
          ...budgets,
          ...(input.autopilotEnabled === undefined
            ? {}
            : { autopilotEnabled: input.autopilotEnabled }),
          ...(input.mode === undefined
            ? {}
            : {
                mode: input.mode,
                autopilotEnabled: input.mode !== 'TEST',
                autopilotNextRunAt: input.mode === 'TEST' ? null : new Date(),
                autopilotLeaseOwner: null,
                autopilotLeaseExpiresAt: null,
              }),
          draftExpirationDays,
        },
        select: {
          id: true,
          configuration: true,
          configurationVersion: true,
          autopilotEnabled: true,
          mode: true,
          draftExpirationDays: true,
          updatedAt: true,
        },
      });
      await writeTelegramAiPostingSettingsVersion(tx, {
        settingsId: result.id,
        version: result.configurationVersion,
        configuration: result.configuration as Prisma.InputJsonValue,
        changeSource: 'manual',
      });
      return {
        configuration: result.configuration,
        configurationVersion: result.configurationVersion,
        autopilotEnabled: result.autopilotEnabled,
        mode: result.mode,
        draftExpirationDays: result.draftExpirationDays,
        updatedAt: result.updatedAt,
      };
    });
    return {
      ...saved,
      sourceCleanup: {
        checkedCount: cleanedSources.checkedCount,
        removed: cleanedSources.removed,
      },
    };
  }

  async checkSource(
    userId: string,
    channelId: string,
    sourceId: string,
    candidate?: Record<string, unknown>,
  ) {
    const { workspaceId } = await this.owned(userId, channelId);
    const settings = await this.prisma.telegramAiPostingSettings.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      select: { configuration: true },
    });
    const storedConfiguration = settings?.configuration as Record<
      string,
      unknown
    > | null;
    const sources = storedConfiguration?.sources;
    const source =
      candidate ??
      (Array.isArray(sources)
        ? sources.find(
            (item): item is Record<string, unknown> =>
              Boolean(item) &&
              typeof item === 'object' &&
              !Array.isArray(item) &&
              (item as Record<string, unknown>).id === sourceId,
          )
        : null);
    if (!source) throw new NotFoundException('AI Posting source not found');
    const sourceType = source.type;
    const sourceValue = source.value;
    if (
      (sourceType !== 'website' &&
        sourceType !== 'rss' &&
        sourceType !== 'telegram') ||
      typeof sourceValue !== 'string' ||
      !sourceValue.trim()
    )
      throw new BadRequestException('Invalid AI Posting source');
    if (sourceType === 'website' || sourceType === 'rss') {
      try {
        const url = new URL(sourceValue);
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error();
      } catch {
        return {
          ok: false,
          available: false,
          message: 'Введите корректный HTTPS-адрес источника.',
        };
      }
      if (this.sourceCollector)
        return this.sourceCollector.checkWebSource(sourceType, sourceValue);
      return {
        ok: false,
        available: false,
        message: 'Проверка источника недоступна.',
      };
    }
    if (sourceType === 'telegram') {
      if (!isValidTelegramAiPostingSourceId(sourceValue))
        return {
          ok: false,
          available: false,
          message: 'Telegram source identifier is invalid.',
        };
      const available = await this.prisma.telegramChannel.findFirst({
        where: telegramAiPostingSourceWhere(workspaceId, channelId, [
          sourceValue,
        ]),
        select: { id: true },
      });
      if (!available)
        return {
          ok: false,
          available: false,
          message:
            'Telegram channel is unavailable or not eligible in this workspace.',
        };
    }
    return { ok: true, message: 'Source settings look valid.' };
  }

  private async cleanUnavailableSources(
    workspaceId: string,
    targetChannelId: string,
    sources: unknown[],
  ) {
    const candidates = sources.map((value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null,
    );
    const telegramIds = [
      ...new Set(
        candidates
          .filter(
            (source) => source?.type === 'telegram' && source.enabled !== false,
          )
          .map((source) => source?.value)
          .filter(isValidTelegramAiPostingSourceId),
      ),
    ];
    const eligibleTelegramIds = new Set<string>();
    if (telegramIds.length) {
      const eligible = await this.prisma.telegramChannel.findMany({
        where: telegramAiPostingSourceWhere(
          workspaceId,
          targetChannelId,
          telegramIds,
        ),
        select: { id: true },
      });
      for (const channel of eligible) eligibleTelegramIds.add(channel.id);
    }

    const kept: unknown[] = [];
    const removed: Array<{
      id?: string;
      type: string;
      value: string;
      reason: string;
    }> = [];
    let checkedCount = 0;
    const checkWeb = async (
      source: Record<string, unknown>,
      type: 'website' | 'rss',
      value: string,
    ) => {
      if (source.enabled === false) return { available: true };
      let url: URL;
      try {
        url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password)
          throw new Error();
      } catch {
        return { available: false, reason: 'Некорректный HTTPS-адрес.' };
      }
      if (!this.sourceCollector)
        return { available: false, reason: 'Проверка источника недоступна.' };
      checkedCount++;
      try {
        const result = await this.sourceCollector.checkWebSource(type, value);
        return {
          available: result.available ?? result.ok,
          reason: result.message,
        };
      } catch {
        return { available: false, reason: 'Источник недоступен.' };
      }
    };

    for (let offset = 0; offset < candidates.length; offset += 5) {
      const chunk = candidates.slice(offset, offset + 5);
      const results = await Promise.all(
        chunk.map(async (source) => {
          if (!source)
            return { source, available: false, reason: 'Некорректная запись.' };
          const type = typeof source.type === 'string' ? source.type : '';
          const value =
            typeof source.value === 'string' ? source.value.trim() : '';
          if (
            (type !== 'website' && type !== 'rss' && type !== 'telegram') ||
            !value
          )
            return {
              source,
              available: false,
              reason: 'Некорректный источник.',
            };
          if (type === 'telegram') {
            const valid = isValidTelegramAiPostingSourceId(value);
            const available =
              source.enabled === false ||
              (valid && eligibleTelegramIds.has(value));
            return {
              source,
              available,
              reason: valid
                ? 'Telegram-канал недоступен или нет права чтения.'
                : 'Некорректный Telegram-канал.',
            };
          }
          const checked = await checkWeb(source, type, value);
          return { source, ...checked };
        }),
      );
      for (const result of results) {
        if (result.available && result.source) kept.push(result.source);
        else if (result.source)
          removed.push({
            ...(typeof result.source.id === 'string'
              ? { id: result.source.id }
              : {}),
            type:
              typeof result.source.type === 'string'
                ? result.source.type
                : 'unknown',
            value:
              typeof result.source.value === 'string'
                ? result.source.value.slice(0, 500)
                : '',
            reason: result.reason ?? 'Источник недоступен.',
          });
      }
    }
    return { sources: kept, removed, checkedCount };
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
      mode: 'REVIEW' | 'AUTOPILOT';
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
      mode: values.mode ?? 'AUTOPILOT',
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
        configuration: defaults,
        ...settings,
        autopilotEnabled: true,
        mode: settings.mode,
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
        mode: 'TEST',
        autopilotNextRunAt: null,
        autopilotLeaseOwner: null,
        autopilotLeaseExpiresAt: null,
      },
    });
    notifyScheduledTaskDueWorkChanged('telegram.ai_posting.autopilot');
    return { autopilotEnabled: false, stopped: result.count > 0 };
  }
}
