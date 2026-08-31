import { Logger } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { Logger as GramJsLogger, LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';

export type TelegramMtprotoSessionCredentials = {
  apiId: string;
  apiHash: string;
  session?: string;
};

const logger = new Logger('TelegramMtprotoSessionFactory');

export async function closeTelegramMtprotoSession(client: TelegramClient) {
  try {
    await client.destroy();
  } catch {
    try {
      await client.disconnect();
    } catch {
      // Closing is idempotent and best effort; callers must be able to retry it.
    }
  }
}

export async function createTelegramMtprotoSession(
  { apiId, apiHash, session }: TelegramMtprotoSessionCredentials,
  signal?: AbortSignal,
) {
  const client = new TelegramClient(
    new StringSession(session || ''),
    Number(apiId),
    apiHash,
    {
      autoReconnect: false,
      baseLogger: new GramJsLogger(LogLevel.NONE),
      connectionRetries: 3,
      reconnectRetries: 0,
    },
  );
  let closePromise: Promise<void> | undefined;
  const closeOnce = () =>
    (closePromise ??= closeTelegramMtprotoSession(client));
  const abortConnect = () => void closeOnce();
  signal?.addEventListener('abort', abortConnect, { once: true });
  try {
    await client.connect();
    if (signal?.aborted) {
      const error = new Error('Telegram MTProto connection was cancelled');
      error.name = 'AbortError';
      throw error;
    }
    return client;
  } catch (error) {
    await closeOnce();
    if (signal?.aborted) await closeTelegramMtprotoSession(client);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortConnect);
    logger.debug(`MTProto connect completed: apiId=${apiId}`);
  }
}
