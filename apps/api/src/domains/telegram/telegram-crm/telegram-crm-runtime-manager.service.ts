import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import type { Subscription } from 'rxjs';
import { TelegramAccountRuntimeNotifier } from '../../../common/telegram-account-runtime-notifier.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmMtprotoAdapter } from '../../../telegram/shared/telegram-crm-mtproto.adapter';
import type {
  TelegramCrmMtprotoHandle,
  TelegramCrmMtprotoUpdate,
} from '../../../telegram/shared/telegram-crm-mtproto.types';
import { isRevokedTelegramSessionError } from '../../../telegram/shared/telegram-session-errors';
import {
  type CrmRuntimeAccount,
  TelegramCrmAccountSessionService,
} from './telegram-crm-account-session.service';
import { TelegramCrmBatchStoreService } from './telegram-crm-batch-store.service';
import { TelegramCrmRecoveryService } from './telegram-crm-recovery.service';
import {
  closeCrmTransport,
  CRM_RUNTIME_POLICY,
  sameCrmRuntimeSession,
  type TelegramCrmManagedAccount as ManagedAccount,
} from './telegram-crm-runtime.policy';

@Injectable()
export class TelegramCrmRuntimeManager
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramCrmRuntimeManager.name);
  private readonly accounts = new Map<string, ManagedAccount>();
  private notifierSubscription?: Subscription;
  private shuttingDown = false;
  private totalQueued = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: TelegramCrmAccountSessionService,
    private readonly adapter: TelegramCrmMtprotoAdapter,
    private readonly batchStore: TelegramCrmBatchStoreService,
    private readonly notifier: TelegramAccountRuntimeNotifier,
    private readonly recoveryService: TelegramCrmRecoveryService,
  ) {}

  async onApplicationBootstrap() {
    this.notifierSubscription = this.notifier.stream.subscribe((change) => {
      void this.reconcile(change.accountId, change.workspaceId);
    });
    const accounts = await this.sessions.startupAccounts(
      CRM_RUNTIME_POLICY.startupAccountLimit + 1,
    );
    if (accounts.length > CRM_RUNTIME_POLICY.startupAccountLimit) {
      throw new Error(
        `CRM runtime account safety limit exceeded (${CRM_RUNTIME_POLICY.startupAccountLimit})`,
      );
    }
    for (
      let index = 0;
      index < accounts.length;
      index += CRM_RUNTIME_POLICY.connectConcurrency
    ) {
      await Promise.all(
        accounts
          .slice(index, index + CRM_RUNTIME_POLICY.connectConcurrency)
          .map((account) => this.start(account)),
      );
    }
  }

  async onApplicationShutdown() {
    this.shuttingDown = true;
    this.notifierSubscription?.unsubscribe();
    await Promise.all(
      [...this.accounts.keys()].map((accountId) => this.stop(accountId)),
    );
  }

  async withAccountHandle<T>(
    workspaceId: string,
    accountId: string,
    purpose: 'sync' | 'send',
    operation: (handle: TelegramCrmMtprotoHandle) => Promise<T>,
  ) {
    const resolved =
      purpose === 'sync'
        ? await this.sessions.requireForSync(workspaceId, accountId)
        : await this.sessions.requireForSend(workspaceId, accountId);
    const managed = this.accounts.get(accountId);
    if (managed?.connecting) await managed.connecting;
    if (managed?.handle) return operation(managed.handle);
    if (managed?.retryTimer) {
      clearTimeout(managed.retryTimer);
      managed.retryTimer = undefined;
      managed.abort = new AbortController();
      managed.generation += 1;
      managed.connecting = this.connect(managed).finally(() => {
        managed.connecting = undefined;
      });
      await managed.connecting;
      if (managed.handle) return operation(managed.handle);
      throw new Error('Telegram CRM account is reconnecting');
    }
    const handle = await this.adapter.open(resolved.credentials);
    try {
      return await operation(handle);
    } finally {
      await handle.close();
    }
  }

  async requestRecovery(accountId: string) {
    const managed = this.accounts.get(accountId);
    if (!managed?.handle) return;
    await this.recover(managed);
  }

  wakeAccount(accountId: string, workspaceId: string) {
    return this.reconcile(accountId, workspaceId);
  }

  private async reconcile(accountId: string, workspaceId?: string) {
    if (this.shuttingDown) return;
    const account = await this.sessions.find(accountId, workspaceId);
    if (!account || !this.sessions.isLiveEligible(account)) {
      await this.stop(accountId);
      return;
    }
    const current = this.accounts.get(accountId);
    if (
      current &&
      sameCrmRuntimeSession(current.account, account) &&
      (current.handle || current.connecting || current.retryTimer)
    ) {
      return;
    }
    await this.stop(accountId);
    await this.start(account);
  }

  private async start(account: CrmRuntimeAccount) {
    if (this.shuttingDown || this.accounts.has(account.id)) return;
    const managed: ManagedAccount = {
      account,
      generation: 1,
      abort: new AbortController(),
      queue: [],
      retryAttempt: 0,
      flushing: false,
      recovering: false,
      recoveryRequested: false,
    };
    this.accounts.set(account.id, managed);
    managed.connecting = this.connect(managed).finally(() => {
      managed.connecting = undefined;
    });
    await managed.connecting;
  }

  private async connect(managed: ManagedAccount) {
    const generation = managed.generation;
    try {
      const handle = await this.adapter.open(
        this.sessions.credentials(managed.account),
        managed.abort.signal,
      );
      if (
        this.shuttingDown ||
        managed.generation !== generation ||
        this.accounts.get(managed.account.id) !== managed
      ) {
        await handle.close();
        return;
      }
      managed.handle = handle;
      managed.detach = handle.onUpdate(
        (update) => this.enqueue(managed, update),
        (error) => void this.connectionFailed(managed, error),
      );
      await this.recover(managed);
    } catch (error) {
      if (managed.abort.signal.aborted || this.shuttingDown) return;
      await this.connectionFailed(managed, error);
    }
  }

  private enqueue(managed: ManagedAccount, update: TelegramCrmMtprotoUpdate) {
    if (!managed.handle || this.accounts.get(managed.account.id) !== managed)
      return;
    const sequence = 'sequence' in update ? update.sequence : undefined;
    if (
      sequence &&
      managed.lastPts != null &&
      managed.lastPts + sequence.ptsCount !== sequence.pts
    ) {
      void this.recover(managed);
      return;
    }
    if (sequence) managed.lastPts = sequence.pts;
    if (
      managed.queue.length >= CRM_RUNTIME_POLICY.updateQueueLimit ||
      this.totalQueued >= CRM_RUNTIME_POLICY.globalQueueLimit
    ) {
      void this.overflow(managed);
      return;
    }
    managed.queue.push(update);
    this.totalQueued += 1;
    if (managed.recovering) return;
    if (managed.queue.length >= CRM_RUNTIME_POLICY.updateBatchLimit) {
      void this.flush(managed);
    } else if (!managed.flushTimer) {
      managed.flushTimer = setTimeout(
        () => void this.flush(managed),
        CRM_RUNTIME_POLICY.updateFlushMs,
      );
      managed.flushTimer.unref?.();
    }
  }

  private async flush(managed: ManagedAccount) {
    if (managed.flushing || managed.recovering || !managed.handle) return;
    if (managed.flushTimer) clearTimeout(managed.flushTimer);
    managed.flushTimer = undefined;
    const updates = managed.queue.splice(
      0,
      CRM_RUNTIME_POLICY.updateBatchLimit,
    );
    this.totalQueued -= updates.length;
    if (!updates.length) return;
    managed.flushing = true;
    let recoveryNeeded = false;
    try {
      const processedPts = updates.reduce((value, update) => {
        const sequence = 'sequence' in update ? update.sequence : undefined;
        return sequence ? Math.max(value, sequence.pts) : value;
      }, managed.checkpoint?.pts ?? 0);
      const processedCheckpoint = managed.checkpoint
        ? { ...managed.checkpoint, pts: processedPts }
        : undefined;
      const result = await this.batchStore.applyUpdates({
        workspaceId: managed.account.workspaceId,
        accountId: managed.account.id,
        updates,
        checkpoint: processedCheckpoint,
      });
      if (!result.needsRecovery && processedCheckpoint) {
        managed.checkpoint = processedCheckpoint;
      }
      recoveryNeeded = result.needsRecovery;
    } catch (error) {
      managed.queue.unshift(...updates);
      this.totalQueued += updates.length;
      await this.connectionFailed(managed, error);
    } finally {
      managed.flushing = false;
      if (recoveryNeeded || managed.recoveryRequested) {
        managed.recoveryRequested = false;
        void this.recover(managed);
      } else if (managed.queue.length && managed.handle) {
        void this.flush(managed);
      }
    }
  }

  private async recover(managed: ManagedAccount) {
    if (managed.recovering || managed.flushing) {
      managed.recoveryRequested = true;
      return;
    }
    if (!managed.handle) return;
    managed.recovering = true;
    const generation = managed.generation;
    try {
      if (
        !managed.handle ||
        managed.generation !== generation ||
        this.accounts.get(managed.account.id) !== managed
      ) {
        return;
      }
      const result = await this.recoveryService.recover({
        account: managed.account,
        handle: managed.handle,
        captureQueue: () => {
          if (managed.flushTimer) clearTimeout(managed.flushTimer);
          managed.flushTimer = undefined;
          const captured = managed.queue.splice(0);
          this.totalQueued -= captured.length;
          return captured;
        },
        isCurrent: () =>
          managed.generation === generation &&
          this.accounts.get(managed.account.id) === managed &&
          Boolean(managed.handle),
      });
      if (result.outcome === 'SUCCESS') {
        managed.checkpoint = result.checkpoint;
        managed.lastPts = result.checkpoint.pts;
        managed.retryAttempt = 0;
      } else {
        await closeCrmTransport(managed);
        if (result.outcome === 'RETRY') this.scheduleRetry(managed);
      }
    } catch (error) {
      await this.connectionFailed(managed, error);
    } finally {
      managed.recovering = false;
      if (managed.recoveryRequested && managed.handle) {
        managed.recoveryRequested = false;
        void this.recover(managed);
      } else if (managed.queue.length && managed.handle) {
        void this.flush(managed);
      }
    }
  }

  private async overflow(managed: ManagedAccount) {
    await this.recoveryService.setMarker(managed.account, 'QUEUE_OVERFLOW');
    await closeCrmTransport(managed);
    this.scheduleRetry(managed);
  }

  private async connectionFailed(managed: ManagedAccount, error: unknown) {
    if (isRevokedTelegramSessionError(error)) {
      await this.prisma.telegramUserAccountIntegration.updateMany({
        where: {
          id: managed.account.id,
          workspaceId: managed.account.workspaceId,
          status: TelegramUserAccountStatus.connected,
        },
        data: {
          status: TelegramUserAccountStatus.error,
          lastErrorMessage: 'Telegram session was revoked',
        },
      });
      await this.stop(managed.account.id);
      await this.recoveryService.writeFailure(
        managed.account,
        'SESSION_REVOKED',
        error,
      );
      this.notifier.wake({
        workspaceId: managed.account.workspaceId,
        accountId: managed.account.id,
        reason: 'revoked',
      });
      return;
    }
    await closeCrmTransport(managed);
    managed.retryAttempt += 1;
    if (managed.retryAttempt > 8) {
      await this.recoveryService.writeFailure(
        managed.account,
        'RETRY_EXHAUSTED',
        error,
      );
      return;
    }
    this.scheduleRetry(managed);
  }

  private scheduleRetry(managed: ManagedAccount) {
    if (managed.retryTimer || this.shuttingDown || managed.retryAttempt > 8)
      return;
    const cap = Math.min(300_000, 1_000 * 2 ** managed.retryAttempt);
    const delay = Math.floor(Math.random() * cap);
    managed.retryTimer = setTimeout(() => {
      managed.retryTimer = undefined;
      if (!this.accounts.has(managed.account.id)) return;
      managed.abort = new AbortController();
      managed.generation += 1;
      managed.connecting = this.connect(managed).finally(() => {
        managed.connecting = undefined;
      });
    }, delay);
    managed.retryTimer.unref?.();
  }

  private async stop(accountId: string) {
    const managed = this.accounts.get(accountId);
    if (!managed) return;
    this.accounts.delete(accountId);
    managed.generation += 1;
    managed.abort.abort();
    if (managed.flushTimer) clearTimeout(managed.flushTimer);
    if (managed.retryTimer) clearTimeout(managed.retryTimer);
    this.totalQueued -= managed.queue.length;
    managed.queue.length = 0;
    await closeCrmTransport(managed);
  }
}
