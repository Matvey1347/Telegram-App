import { TelegramSourceType } from '@prisma/client';

type PublishSource = {
  sourceId: string;
  sourceType: TelegramSourceType;
  permissions: { canPostMessages: boolean };
};

export function selectManagedPostPublishingSource<T extends PublishSource>(
  sources: T[],
  options: {
    existingScheduledSourceId?: string | null;
    requiresBotApi: boolean;
  },
) {
  const bot = sources.find(
    (source) =>
      source.sourceType === TelegramSourceType.BOT &&
      source.permissions.canPostMessages,
  );
  if (options.requiresBotApi) return bot;

  const existingScheduled = options.existingScheduledSourceId
    ? sources.find(
        (source) =>
          source.sourceId === options.existingScheduledSourceId &&
          source.sourceType === TelegramSourceType.MTPROTO &&
          source.permissions.canPostMessages,
      )
    : undefined;
  return (
    existingScheduled ??
    sources.find(
      (source) =>
        source.sourceType === TelegramSourceType.MTPROTO &&
        source.permissions.canPostMessages,
    ) ??
    bot
  );
}
