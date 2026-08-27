import { TelegramSourceType } from '@prisma/client';

type PublishSource = {
  sourceId: string;
  sourceType: TelegramSourceType;
  permissions: { canPostMessages: boolean };
  accountLastCheckedAt?: Date | string | null;
};

export function managedPostRequiresBotApi(input: {
  hasInlineButtons: boolean;
  requiresRichMessage: boolean;
  isAdvertisingPost: boolean;
  existingSourceType?: TelegramSourceType | null;
  hasExistingPublication?: boolean;
}) {
  return (
    input.hasInlineButtons ||
    input.requiresRichMessage ||
    (input.isAdvertisingPost &&
      !(
        input.existingSourceType === TelegramSourceType.MTPROTO &&
        input.hasExistingPublication
      ))
  );
}

function accountCheckTime(source: PublishSource) {
  if (!source.accountLastCheckedAt) return 0;
  const value = new Date(source.accountLastCheckedAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function selectManagedPostPublishingSource<T extends PublishSource>(
  sources: T[],
  options: {
    existingScheduledSourceId?: string | null;
    requiresBotApi: boolean;
    preferredBotSourceId?: string;
  },
) {
  const bot = sources.find(
    (source) =>
      source.sourceType === TelegramSourceType.BOT &&
      source.permissions.canPostMessages &&
      (!options.preferredBotSourceId ||
        source.sourceId === options.preferredBotSourceId),
  );
  if (options.requiresBotApi) return bot;

  const mtprotoSources = sources
    .filter(
      (source) =>
        source.sourceType === TelegramSourceType.MTPROTO &&
        source.permissions.canPostMessages,
    )
    .sort((left, right) => accountCheckTime(right) - accountCheckTime(left));
  const existingScheduled = options.existingScheduledSourceId
    ? sources.find(
        (source) =>
          source.sourceId === options.existingScheduledSourceId &&
          source.sourceType === TelegramSourceType.MTPROTO &&
          source.permissions.canPostMessages,
      )
    : undefined;
  return existingScheduled ?? mtprotoSources[0] ?? bot;
}
