import { Logger } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { Logger as GramJsLogger, LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { acquireTelegramMtprotoSessionLease } from './telegram-mtproto-session-lease';

export type TelegramMtprotoSessionCredentials = {
  apiId: string;
  apiHash: string;
  session?: string;
};

const logger = new Logger('TelegramMtprotoSessionFactory');
const clientLeaseReleases = new WeakMap<object, () => void>();

export async function closeTelegramMtprotoSession(client: TelegramClient) {
  try {
    try {
      await client.destroy();
    } catch {
      try {
        await client.disconnect();
      } catch {
        // Closing is idempotent and best effort; callers must be able to retry it.
      }
    }
  } finally {
    const release = clientLeaseReleases.get(client);
    clientLeaseReleases.delete(client);
    release?.();
  }
}

export async function createTelegramMtprotoSession(
  { apiId, apiHash, session }: TelegramMtprotoSessionCredentials,
  signal?: AbortSignal,
) {
  const releaseLease = await acquireTelegramMtprotoSessionLease(session);
  let client: TelegramClient | undefined;
  let closePromise: Promise<void> | undefined;
  const closeOnce = () => {
    if (!client) {
      releaseLease();
      return Promise.resolve();
    }
    return (closePromise ??= closeTelegramMtprotoSession(client));
  };
  const abortConnect = () => void closeOnce();
  signal?.addEventListener('abort', abortConnect, { once: true });
  try {
    client = new TelegramClient(
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
    clientLeaseReleases.set(client, releaseLease);
    await client.connect();
    if (signal?.aborted) {
      const error = new Error('Telegram MTProto connection was cancelled');
      error.name = 'AbortError';
      throw error;
    }
    return client;
  } catch (error) {
    await closeOnce();
    if (signal?.aborted && client) await closeTelegramMtprotoSession(client);
    throw error;
  } finally {
    signal?.removeEventListener('abort', abortConnect);
    logger.debug(`MTProto connect completed: apiId=${apiId}`);
  }
}
