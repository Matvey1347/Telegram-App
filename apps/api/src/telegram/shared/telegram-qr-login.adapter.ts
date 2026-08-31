import { Api, TelegramClient } from 'telegram';
import type { TelegramQrLoginProgress } from '@telegram-system/shared';
import type { TelegramAccountProfile } from './telegram-mtproto-account-profile';

type QrLoginResult =
  | {
      status: 'connected';
      session: string;
      profile: TelegramAccountProfile;
    }
  | { status: 'needs_password'; tempSession: string };

type AdapterDependencies = {
  createClient: (signal: AbortSignal) => Promise<TelegramClient>;
  closeClient: (client: TelegramClient) => Promise<void>;
  saveSession: (client: TelegramClient) => string;
  getProfile: (
    client: TelegramClient,
    user?: Api.User | null,
  ) => Promise<TelegramAccountProfile>;
};

function abortError() {
  const error = new Error('Telegram QR login was cancelled');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw abortError();
}

function tokenUpdateWaiter(client: TelegramClient, signal: AbortSignal) {
  let pendingUpdate = false;
  let active:
    | {
        resolve: () => void;
        reject: (error: Error) => void;
        timer: NodeJS.Timeout;
      }
    | undefined;
  const finish = (error?: Error) => {
    if (!active) return;
    const current = active;
    active = undefined;
    clearTimeout(current.timer);
    if (error) current.reject(error);
    else current.resolve();
  };
  const onUpdate = (update: unknown) => {
    if (!(update instanceof Api.UpdateLoginToken)) return;
    if (active) finish();
    else pendingUpdate = true;
  };
  const onAbort = () => finish(abortError());
  client.addEventHandler(onUpdate);
  signal.addEventListener('abort', onAbort, { once: true });

  return {
    waitUntil(expiresAt: number) {
      throwIfAborted(signal);
      if (pendingUpdate) {
        pendingUpdate = false;
        return Promise.resolve();
      }
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => finish(),
          Math.max(0, expiresAt - Date.now()),
        );
        active = { resolve, reject, timer };
      });
    },
    cleanup() {
      signal.removeEventListener('abort', onAbort);
      client.removeEventHandler(onUpdate, undefined as never);
      finish(abortError());
    },
  };
}

/**
 * One bounded, request-owned GramJS QR authorization operation.
 * It creates no persistent work: the caller owns cancellation and the client
 * is always destroyed before this function settles.
 */
export async function loginWithTelegramQr(
  apiId: string,
  apiHash: string,
  signal: AbortSignal,
  onProgress: (progress: TelegramQrLoginProgress) => void | Promise<void>,
  dependencies: AdapterDependencies,
): Promise<QrLoginResult> {
  throwIfAborted(signal);
  const client = await dependencies.createClient(signal);
  const waiter = tokenUpdateWaiter(client, signal);
  let closePromise: Promise<void> | undefined;
  const closeOnce = () => {
    closePromise ??= dependencies.closeClient(client);
    return closePromise;
  };
  const closeOnAbort = () => void closeOnce();
  signal.addEventListener('abort', closeOnAbort, { once: true });
  try {
    while (true) {
      throwIfAborted(signal);
      let tokenResult = await client.invoke(
        new Api.auth.ExportLoginToken({
          apiId: Number(apiId),
          apiHash,
          exceptIds: [],
        }),
      );

      if (tokenResult instanceof Api.auth.LoginTokenMigrateTo) {
        await client._switchDC(tokenResult.dcId);
        throwIfAborted(signal);
        tokenResult = await client.invoke(
          new Api.auth.ImportLoginToken({ token: tokenResult.token }),
        );
      }

      if (tokenResult instanceof Api.auth.LoginTokenSuccess) {
        if (!(tokenResult.authorization instanceof Api.auth.Authorization)) {
          throw new Error(
            'Telegram QR login returned an invalid authorization',
          );
        }
        const user = tokenResult.authorization.user as Api.User;
        return {
          status: 'connected',
          session: dependencies.saveSession(client),
          profile: await dependencies.getProfile(client, user),
        };
      }

      if (!(tokenResult instanceof Api.auth.LoginToken)) {
        throw new Error('Telegram QR login returned an unexpected token state');
      }

      const expiresAt = tokenResult.expires * 1000;
      await onProgress({
        type: 'qr',
        loginUrl: `tg://login?token=${tokenResult.token.toString('base64url')}`,
        expiresAt,
      });
      await waiter.waitUntil(expiresAt);
    }
  } catch (error: unknown) {
    if (
      (error as { errorMessage?: string })?.errorMessage ===
      'SESSION_PASSWORD_NEEDED'
    ) {
      return {
        status: 'needs_password',
        tempSession: dependencies.saveSession(client),
      };
    }
    throw error;
  } finally {
    signal.removeEventListener('abort', closeOnAbort);
    waiter.cleanup();
    await closeOnce();
    // `_switchDC()` can reconnect after the abort-triggered close finishes.
    // A final post-operation close guarantees that migration cannot leave a
    // revived transport behind after the request has been cancelled.
    if (signal.aborted) await dependencies.closeClient(client);
  }
}
