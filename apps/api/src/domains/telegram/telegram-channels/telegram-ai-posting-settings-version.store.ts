import { Prisma } from '@prisma/client';

export type TelegramAiPostingChangeSource = 'manual' | 'feedback' | 'system';

export function writeTelegramAiPostingSettingsVersion(
  tx: Prisma.TransactionClient,
  input: {
    settingsId: string;
    version: number;
    configuration: Prisma.InputJsonValue;
    changeSource: TelegramAiPostingChangeSource;
    changedByMemberId?: string | null;
  },
) {
  return tx.telegramAiPostingSettingsVersion.create({
    data: {
      settingsId: input.settingsId,
      version: input.version,
      configuration: input.configuration,
      changeSource: input.changeSource,
      changedByMemberId: input.changedByMemberId ?? null,
    },
    select: { id: true, version: true, changeSource: true, createdAt: true },
  });
}
