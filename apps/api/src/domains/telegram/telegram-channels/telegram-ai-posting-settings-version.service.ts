import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { writeTelegramAiPostingSettingsVersion } from './telegram-ai-posting-settings-version.store';

@Injectable()
export class TelegramAiPostingSettingsVersionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  async list(userId: string, channelId: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const settings = await this.prisma.telegramAiPostingSettings.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!settings) throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
    return this.prisma.telegramAiPostingSettingsVersion.findMany({
      where: { settingsId: settings.id },
      select: {
        id: true,
        version: true,
        changeSource: true,
        changedByMemberId: true,
        createdAt: true,
      },
      orderBy: { version: 'desc' },
      take: 100,
    });
  }

  async get(userId: string, channelId: string, version: number) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const settings = await this.prisma.telegramAiPostingSettings.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!settings) throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
    const snapshot =
      await this.prisma.telegramAiPostingSettingsVersion.findUnique({
        where: { settingsId_version: { settingsId: settings.id, version } },
      });
    if (!snapshot)
      throw new NotFoundException('AI_POSTING_SETTINGS_VERSION_NOT_FOUND');
    return snapshot;
  }

  async rollback(userId: string, channelId: string, version: number) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    return this.prisma.$transaction(async (tx) => {
      const settings = await tx.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
      });
      if (!settings)
        throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
      const source = await tx.telegramAiPostingSettingsVersion.findUnique({
        where: { settingsId_version: { settingsId: settings.id, version } },
      });
      if (!source)
        throw new NotFoundException('AI_POSTING_SETTINGS_VERSION_NOT_FOUND');
      const nextVersion = settings.configurationVersion + 1;
      const updated = await tx.telegramAiPostingSettings.updateMany({
        where: {
          id: settings.id,
          workspaceId,
          configurationVersion: settings.configurationVersion,
        },
        data: {
          configuration: source.configuration as Prisma.InputJsonValue,
          configurationVersion: nextVersion,
        },
      });
      if (!updated.count)
        throw new ConflictException('AI_POSTING_SETTINGS_CHANGED');
      const snapshot = await writeTelegramAiPostingSettingsVersion(tx, {
        settingsId: settings.id,
        version: nextVersion,
        configuration: source.configuration as Prisma.InputJsonValue,
        changeSource: 'manual',
      });
      return { applied: true, configurationVersion: nextVersion, snapshot };
    });
  }
}
