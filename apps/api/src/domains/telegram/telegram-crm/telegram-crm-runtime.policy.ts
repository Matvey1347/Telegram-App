import type {
  TelegramCrmMtprotoCheckpoint,
  TelegramCrmMtprotoHandle,
  TelegramCrmMtprotoUpdate,
} from '../../../telegram/shared/telegram-crm-mtproto.types';
import type { CrmRuntimeAccount } from './telegram-crm-account-session.service';

export const CRM_RUNTIME_POLICY = {
  startupAccountLimit: 100,
  connectConcurrency: 5,
  updateQueueLimit: 256,
  globalQueueLimit: 4_096,
  updateBatchLimit: 100,
  updateFlushMs: 50,
} as const;

export type TelegramCrmManagedAccount = {
  account: CrmRuntimeAccount;
  generation: number;
  abort: AbortController;
  handle?: TelegramCrmMtprotoHandle;
  connecting?: Promise<void>;
  detach?: () => void;
  queue: TelegramCrmMtprotoUpdate[];
  flushTimer?: NodeJS.Timeout;
  retryTimer?: NodeJS.Timeout;
  retryAttempt: number;
  lastPts?: number;
  checkpoint?: TelegramCrmMtprotoCheckpoint;
  flushing: boolean;
  recovering: boolean;
  recoveryRequested: boolean;
};

export function sameCrmRuntimeSession(
  left: CrmRuntimeAccount,
  right: CrmRuntimeAccount,
) {
  return (
    left.workspaceId === right.workspaceId &&
    left.status === right.status &&
    left.isActive === right.isActive &&
    left.crmSyncEnabled === right.crmSyncEnabled &&
    left.apiId === right.apiId &&
    left.apiHashEncrypted === right.apiHashEncrypted &&
    left.apiHashIv === right.apiHashIv &&
    left.apiHashAuthTag === right.apiHashAuthTag &&
    left.sessionEncrypted === right.sessionEncrypted &&
    left.sessionIv === right.sessionIv &&
    left.sessionAuthTag === right.sessionAuthTag
  );
}

export async function closeCrmTransport(account: TelegramCrmManagedAccount) {
  account.detach?.();
  account.detach = undefined;
  const handle = account.handle;
  account.handle = undefined;
  if (handle) await handle.close();
}
