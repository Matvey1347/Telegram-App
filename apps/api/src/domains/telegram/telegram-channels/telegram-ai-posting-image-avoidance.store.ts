import { Prisma } from '@prisma/client';
import { writeTelegramAiPostingSettingsVersion } from './telegram-ai-posting-settings-version.store';

export async function saveRejectedTelegramAiPostingImage(
  tx: Prisma.TransactionClient,
  input: {
    settingsId: string;
    workspaceId: string;
    channelId: string;
    expectedVersion: number;
    configuration: Record<string, unknown>;
  },
) {
  const updated = await tx.telegramAiPostingSettings.updateMany({
    where: {
      id: input.settingsId,
      workspaceId: input.workspaceId,
      telegramChannelId: input.channelId,
      configurationVersion: input.expectedVersion,
    },
    data: {
      configuration: input.configuration as Prisma.InputJsonObject,
      configurationVersion: { increment: 1 },
    },
  });
  if (updated.count) {
    await writeTelegramAiPostingSettingsVersion(tx, {
      settingsId: input.settingsId,
      version: input.expectedVersion + 1,
      configuration: input.configuration as Prisma.InputJsonObject,
      changeSource: 'system',
    });
  }
  return updated.count;
}
