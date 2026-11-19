import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { TelegramClient } from 'telegram';
import { Logger as GramJsLogger, LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { acquireTelegramMtprotoSessionLease } from './telegram-mtproto-session-lease';
import {
  TelegramMtprotoSessionPool,
  TelegramSessionCloseError,
} from './telegram-mtproto-session-pool';

export type TelegramMtprotoSessionCredentials = {
  apiId: string;
  apiHash: string;
  session?: string;
};

const logger = new Logger('TelegramMtprotoSessionFactory');
const clientLeaseReleases = new WeakMap<object, () => void>();
const physicalClosePromises = new WeakMap<object, Promise<void>>();

function closePhysical(client: TelegramClient): Promise<void> {
  const existing = physicalClosePromises.get(client);
  if (existing) return existing;
  const closing = (async () => {
    try {
      await client.destroy();
    } catch {
      // Best effort stops the primary transport, but a failed destroy cannot
      // prove borrowed/exported transports closed. Retain the session lease.
      try {
        await client.disconnect();
      } catch {
        /* Keep shutdown unconfirmed. */
      }
      throw new TelegramSessionCloseError(
        'Telegram transport shutdown could not be confirmed',
      );
    }
    const release = clientLeaseReleases.get(client);
    clientLeaseReleases.delete(client);
    release?.();
  })();
  physicalClosePromises.set(client, closing);
  return closing;
}

const sessions = new TelegramMtprotoSessionPool<TelegramClient>(closePhysical);

export function subscribeTelegramMtprotoSessionInvalidation(
  client: TelegramClient,
  handler: (error: Error) => void | Promise<void>,
) {
  return sessions.subscribeInvalidation(client, handler);
}

export async function closeTelegramMtprotoSession(client: TelegramClient) {
  if (!(await sessions.close(client))) await closePhysical(client);
}

async function openPhysical(
  { apiId, apiHash, session }: TelegramMtprotoSessionCredentials,
  signal: AbortSignal,
) {
  const releaseLease = await acquireTelegramMtprotoSessionLease(
    session,
    signal,
  );
  try {
    signal.throwIfAborted();
  } catch (error) {
    releaseLease();
    throw error;
  }
  let client: TelegramClient;
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
  } catch (error) {
    releaseLease();
    throw error;
  }
  clientLeaseReleases.set(client, releaseLease);
  // Interrupt connect without releasing ownership. If connect resumes late,
  // its settled continuation below destroys it again before releasing the lease.
  const abortConnect = () => {
    void client.destroy().catch(() => undefined);
  };
  signal.addEventListener('abort', abortConnect, { once: true });
  try {
    signal.throwIfAborted();
    await client.connect();
    signal.throwIfAborted();
    return client;
  } catch (error) {
    await closePhysical(client);
    throw error;
  } finally {
    signal.removeEventListener('abort', abortConnect);
    logger.debug(`MTProto connect completed: apiId=${apiId}`);
  }
}

export async function createTelegramMtprotoSession(
  credentials: TelegramMtprotoSessionCredentials,
  signal?: AbortSignal,
) {
  if (!credentials.session)
    return openPhysical(credentials, signal ?? new AbortController().signal);
  const digest = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  return sessions.acquire(
    credentials.session ? digest(credentials.session) : undefined,
    digest(`${credentials.apiId}:${credentials.apiHash}`),
    (connectSignal) => openPhysical(credentials, connectSignal),
    signal,
  );
}
