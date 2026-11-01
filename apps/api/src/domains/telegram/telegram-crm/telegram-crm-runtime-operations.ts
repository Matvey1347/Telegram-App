import { ConflictException } from '@nestjs/common';
import type { TelegramCrmMtprotoHandle } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';
import { TelegramCrmMtprotoAdapter } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.adapter';
import { TelegramCrmAccountSessionService } from './telegram-crm-account-session.service';
import type { TelegramCrmManagedAccount } from './telegram-crm-runtime.policy';

/** Existing ordinary CRM manual-operation fallback, unchanged by Discovery. */
export async function withCrmAccountHandle<T>(input: {
  workspaceId: string;
  accountId: string;
  purpose: 'sync' | 'send';
  blocked: boolean;
  sessions: TelegramCrmAccountSessionService;
  adapter: TelegramCrmMtprotoAdapter;
  getManaged: (id: string) => TelegramCrmManagedAccount | undefined;
  operation: (handle: TelegramCrmMtprotoHandle) => Promise<T>;
}) {
  if (input.blocked)
    throw new ConflictException(
      'Telegram CRM runtime is active in another application instance. Retry shortly.',
    );
  const resolved =
    input.purpose === 'sync'
      ? await input.sessions.requireForSync(input.workspaceId, input.accountId)
      : await input.sessions.requireForSend(input.workspaceId, input.accountId);
  const managed = input.getManaged(input.accountId);
  if (managed?.connecting) await managed.connecting;
  if (managed?.handle) return input.operation(managed.handle);
  const handle = await input.adapter.open(resolved.credentials);
  try {
    return await input.operation(handle);
  } finally {
    await handle.close();
  }
}
