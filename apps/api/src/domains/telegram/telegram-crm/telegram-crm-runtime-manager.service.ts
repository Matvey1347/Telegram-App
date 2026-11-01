import { TelegramCrmFolderRefreshService } from './telegram-crm-folder-refresh.service';
import { crmRuntimeEnabled } from '../../../config/deployment-config';
import { reconcileCrmReactionHints } from './telegram-crm-reaction-reconcile';
import { withCrmAccountHandle } from './telegram-crm-runtime-operations';
import { TelegramLeadTransportEvents } from '@api/telegram/shared/mtproto/telegram-lead-transport-events';
import {
  notifyCrmReauthentication,
  reconcileCrmRevokedNotifications,
  waitForCrmStartupBudget,
} from './telegram-crm-runtime-notifications';
import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import type { Subscription } from 'rxjs';
import { TelegramAccountRuntimeNotifier } from '../../../common/telegram-account-runtime-notifier.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmMtprotoAdapter } from '@api/telegram/shared/mtproto/telegram-crm-mtproto.adapter';
import type {
  TelegramCrmMtprotoHandle,
  TelegramCrmMtprotoUpdate,
} from '@api/telegram/shared/mtproto/telegram-crm-mtproto.types';
import {
  isRevokedTelegramSessionError,
  telegramRevokedSessionErrorCode,
} from '@api/telegram/shared/mtproto/telegram-session-errors';
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
import { OperationsNotificationStoreService } from '../../operations/notifications/operations-notification-store.service';
import { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import { TelegramCrmRuntimeLeaseService } from './telegram-crm-runtime-lease.service';

@Injectable()
export class TelegramCrmRuntimeManager
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramCrmRuntimeManager.name);
  private readonly folderFences = new Map<string, Promise<void>>();
  private readonly accounts = new Map<string, ManagedAccount>();
  private notifierSubscription?: Subscription;
  private runtimeHeldByAnotherInstance = false;
  private readonly runtimeEnabled = crmRuntimeEnabled();
  private reacquiring?: Promise<boolean>;
  private startupLeaseDenied = false;
  private shuttingDown = false;
  private totalQueued = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: TelegramCrmAccountSessionService,
    private readonly adapter: TelegramCrmMtprotoAdapter,
    private readonly batchStore: TelegramCrmBatchStoreService,
    private readonly notifier: TelegramAccountRuntimeNotifier,
    private readonly recoveryService: TelegramCrmRecoveryService,
    @Optional()
    private readonly notifications?: OperationsNotificationStoreService,
    @Optional()
    private readonly notificationPublisher?: OperationsNotificationPublisherService,
    @Optional()
    private readonly runtimeLease?: TelegramCrmRuntimeLeaseService,
    @Optional() private readonly leadEvents?: TelegramLeadTransportEvents,
    @Optional()
    private readonly folderRefresh?: TelegramCrmFolderRefreshService,
  ) {}

  async onApplicationBootstrap() {
    if (!this.runtimeEnabled) {
      this.runtimeHeldByAnotherInstance = true;
      return;
    }
    const accounts = await this.sessions.startupAccounts(
      CRM_RUNTIME_POLICY.startupAccountLimit + 1,
    );
    if (accounts.length > CRM_RUNTIME_POLICY.startupAccountLimit) {
      throw new Error(
        `CRM runtime account safety limit exceeded (${CRM_RUNTIME_POLICY.startupAccountLimit})`,
      );
    }
    if (accounts.length && !(await this.acquireRuntimeLease())) {
      this.startupLeaseDenied = true;
      return;
    }
    this.subscribeToAccountChanges();
    const startupConnections = this.connectStartupAccounts(accounts);
    await this.reconcileRevokedAccountNotifications();
    await waitForCrmStartupBudget(startupConnections);
  }

  async onApplicationShutdown() {
    this.shuttingDown = true;
    this.notifierSubscription?.unsubscribe();
    await this.reacquiring?.catch(() => false);
    await Promise.all(
      [...this.accounts.keys()].map((accountId) => this.stop(accountId)),
    );
    await this.runtimeLease?.release();
  }

  async withAccountHandle<T>(
    workspaceId: string,
    accountId: string,
    purpose: 'sync' | 'send' | 'folder-sync',
    operation: (handle: TelegramCrmMtprotoHandle) => Promise<T>,
  ) {
    await this.ensureRuntimeOwnership();
    return withCrmAccountHandle({
      workspaceId,
      accountId,
      purpose: purpose === 'folder-sync' ? 'sync' : purpose,
      operation: (handle) => {
        const managed = this.accounts.get(accountId);
        if (
          managed?.handle === handle &&
          this.folderRefresh?.needsRetry(accountId)
        )
          this.refreshFolders(managed);
        return purpose === 'folder-sync' && this.folderRefresh
          ? this.folderRefresh.withAccountScan(accountId, () =>
              operation(handle),
            )
          : operation(handle);
      },
      blocked: this.runtimeHeldByAnotherInstance || this.shuttingDown,
      sessions: this.sessions,
      adapter: this.adapter,
      getManaged: (id) => this.accounts.get(id),
    });
  }

  private async ensureRuntimeOwnership() {
    if (this.reacquiring) await this.reacquiring;
    else if (
      this.runtimeEnabled &&
      this.runtimeHeldByAnotherInstance &&
      this.startupLeaseDenied &&
      !this.shuttingDown
    ) {
      this.reacquiring = this.recoverRuntimeOwnership().finally(() => {
        this.reacquiring = undefined;
      });
      await this.reacquiring;
    }
  }

  liveAccountIds(workspaceId: string) {
    return [...this.accounts.values()]
      .filter(
        (item) =>
          item.account.workspaceId === workspaceId &&
          item.handle?.leadDiscovery,
      )
      .map((item) => item.account.id);
  }
  async withLiveAccountHandle<T>(
    workspaceId: string,
    accountId: string,
    operation: (handle: TelegramCrmMtprotoHandle) => Promise<T>,
  ): Promise<T> {
    await this.ensureRuntimeOwnership();
    const managed = this.accounts.get(accountId);
    await managed?.connecting;
    const current = await this.sessions.find(accountId, workspaceId);
    if (
      this.runtimeHeldByAnotherInstance ||
      this.shuttingDown ||
      !managed?.handle?.leadDiscovery ||
      managed.account.workspaceId !== workspaceId ||
      !current ||
      !this.sessions.isLiveEligible(current)
    )
      throw new ConflictException('LEAD_EXISTING_LIVE_ACCOUNT_REQUIRED');
    if (this.folderRefresh?.needsRetry(accountId)) this.refreshFolders(managed);
    return operation(managed.handle);
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
    if (this.shuttingDown || !this.runtimeEnabled) return;
    const account = await this.sessions.find(accountId, workspaceId);
    if (!account || !this.sessions.isLiveEligible(account)) {
      await this.stop(accountId);
      return;
    }
    if (!(await this.acquireRuntimeLease())) return;
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

  private async acquireRuntimeLease() {
    // Optional only for direct unit construction; Nest always provides it.
    if (!this.runtimeLease) return true;
    const acquired = await this.runtimeLease.acquire();
    if (!acquired) {
      this.runtimeHeldByAnotherInstance = true;
      this.logger.warn(
        'Telegram CRM runtime is already owned by another application instance; skipping MTProto connections.',
      );
      return false;
    }
    this.runtimeHeldByAnotherInstance = false;
    this.runtimeLease.startRenewing(() => void this.handleRuntimeLeaseLost());
    return true;
  }

  private async recoverRuntimeOwnership() {
    if (!(await this.acquireRuntimeLease())) return false;
    try {
      if (this.shuttingDown) return false;
      const accounts = await this.sessions.startupAccounts(
        CRM_RUNTIME_POLICY.startupAccountLimit + 1,
      );
      if (accounts.length > CRM_RUNTIME_POLICY.startupAccountLimit)
        throw new Error('CRM runtime account safety limit exceeded');
      this.subscribeToAccountChanges();
      await this.connectStartupAccounts(accounts);
      this.startupLeaseDenied = false;
      return true;
    } catch (error) {
      this.runtimeHeldByAnotherInstance = true;
      await Promise.all(
        [...this.accounts.keys()].map((accountId) => this.stop(accountId)),
      );
      await this.runtimeLease?.release();
      throw error;
    }
  }

  private subscribeToAccountChanges() {
    if (this.notifierSubscription && !this.notifierSubscription.closed) return;
    this.notifierSubscription = this.notifier.stream.subscribe((change) => {
      void this.reconcile(change.accountId, change.workspaceId);
    });
  }

  private async handleRuntimeLeaseLost() {
    if (this.shuttingDown) return;
    this.logger.error(
      'Telegram CRM runtime lease was lost; closing live MTProto connections.',
    );
    this.runtimeHeldByAnotherInstance = true;
    this.notifierSubscription?.unsubscribe();
    await Promise.all(
      [...this.accounts.keys()].map((accountId) => this.stop(accountId)),
    );
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
    const connectionAbort = new AbortController();
    const abortConnection = () => connectionAbort.abort();
    managed.abort.signal.addEventListener('abort', abortConnection, {
      once: true,
    });
    let connectionTimedOut = false;
    let timeout: NodeJS.Timeout | undefined;
    try {
      const opening = this.adapter.open(
        this.sessions.credentials(managed.account),
        connectionAbort.signal,
      );
      // If an adapter ignores AbortSignal, close a late handle rather than
      // leaking it after this attempt has already moved to retry backoff.
      void opening.then(
        (handle) => {
          if (connectionTimedOut) void handle.close();
        },
        () => undefined,
      );
      const timedOut = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          connectionTimedOut = true;
          connectionAbort.abort();
          reject(new Error('Telegram MTProto connection timed out'));
        }, CRM_RUNTIME_POLICY.connectTimeoutMs);
        timeout.unref?.();
      });
      const handle = await Promise.race([opening, timedOut]);
      if (
        this.shuttingDown ||
        managed.generation !== generation ||
        this.accounts.get(managed.account.id) !== managed
      ) {
        await handle.close();
        return;
      }
      const priorFolderFence = this.folderFences.get(managed.account.id);
      try {
        await priorFolderFence;
      } catch (error) {
        if (this.folderFences.get(managed.account.id) === priorFolderFence)
          this.folderFences.delete(managed.account.id);
        await handle.close();
        throw error;
      }
      await this.folderRefresh?.waitForMarkers?.(managed.account.id);
      managed.handle = handle;
      managed.folderFence = priorFolderFence;
      const detachPrivate = handle.onUpdate(
        (update) => this.enqueue(managed, update),
        (error) => void this.connectionFailed(managed, error),
      );
      const identity = {
        workspaceId: managed.account.workspaceId,
        accountId: managed.account.id,
      };
      const detachLead = this.leadEvents?.enabled
        ? handle.leadDiscovery?.onEvent((event) =>
            this.leadEvents?.emit({ ...identity, type: 'channel', event }),
          )
        : undefined;
      managed.detach = () => {
        detachPrivate();
        detachLead?.();
        this.leadEvents?.emit({ ...identity, type: 'disconnected' });
      };
      this.leadEvents?.emit({ ...identity, type: 'connected' });
      void this.folderRefresh
        ?.resumePending(
          managed.account,
          handle,
          () =>
            this.accounts.get(managed.account.id) === managed &&
            managed.handle === handle &&
            managed.generation === generation &&
            !managed.abort.signal.aborted,
          managed.abort.signal,
        )
        .catch(() => undefined);
      await this.recover(managed);
    } catch (error) {
      if (managed.abort.signal.aborted || this.shuttingDown) return;
      await this.connectionFailed(managed, error);
    } finally {
      if (timeout) clearTimeout(timeout);
      managed.abort.signal.removeEventListener('abort', abortConnection);
    }
  }

  private async connectStartupAccounts(accounts: CrmRuntimeAccount[]) {
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

  private refreshFolders(
    managed: ManagedAccount,
    userIds?: string[],
    version?: number,
  ) {
    const handle = managed.handle;
    const generation = managed.generation;
    if (!handle) this.folderRefresh?.abandonTargeted(managed.account.id);
    if (handle)
      void this.folderRefresh
        ?.request(
          managed.account,
          handle,
          () =>
            this.accounts.get(managed.account.id) === managed &&
            managed.handle === handle &&
            managed.generation === generation &&
            !managed.abort.signal.aborted,
          managed.abort.signal,
          userIds,
          version,
        )
        .catch(() => undefined);
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
    if (update.type === 'folders.changed') {
      if (!update.telegramUserIds || update.telegramUserIds.length) {
        const ids = update.telegramUserIds;
        const originHandle = managed.handle;
        const originGeneration = managed.generation;
        managed.folderFence = (
          this.folderFences.get(managed.account.id) ??
          managed.folderFence ??
          Promise.resolve()
        ).then(async () => {
          const dirty = await this.folderRefresh?.markDirty(
            managed.account,
            Boolean(ids),
          );
          if (
            managed.handle !== originHandle ||
            managed.generation !== originGeneration ||
            this.accounts.get(managed.account.id) !== managed
          ) {
            this.folderRefresh?.abandonTargeted(managed.account.id);
            return;
          }
          this.refreshFolders(
            managed,
            dirty?.targeted ? ids : undefined,
            dirty?.version,
          );
        });
        this.folderFences.set(managed.account.id, managed.folderFence);
        const folderFence = managed.folderFence;
        void folderFence.then(
          () => {
            if (this.folderFences.get(managed.account.id) === folderFence)
              this.folderFences.delete(managed.account.id);
          },
          () => undefined,
        );
        void managed.folderFence.catch((error: unknown) =>
          this.connectionFailed(managed, error),
        );
      }
      return;
    }
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
      await managed.folderFence;
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
        updates: await reconcileCrmReactionHints(
          this.prisma,
          managed.account,
          managed.handle,
          updates,
        ),
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
      await managed.folderFence;
      const result = await this.recoveryService.recover({
        account: managed.account,
        handle: managed.handle,
        onNewConversations: (userIds, version) =>
          this.refreshFolders(managed, userIds, version),
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
        if (this.folderRefresh?.needsRetry(managed.account.id))
          this.refreshFolders(managed);
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
      const telegramErrorCode =
        telegramRevokedSessionErrorCode(error) ?? 'SESSION_REVOKED';
      this.logger.warn(
        `Telegram MTProto session revoked for account=${managed.account.id}: ${telegramErrorCode}`,
      );
      const transition =
        await this.prisma.telegramUserAccountIntegration.updateMany({
          where: {
            id: managed.account.id,
            workspaceId: managed.account.workspaceId,
            status: TelegramUserAccountStatus.connected,
          },
          data: {
            status: TelegramUserAccountStatus.error,
            lastErrorMessage: `Telegram session was revoked (${telegramErrorCode})`,
          },
        });
      if (transition.count) {
        await this.notifyReauthenticationRequired(managed.account);
      }
      await this.stop(managed.account.id);
      await this.recoveryService.writeFailure(
        managed.account,
        telegramErrorCode,
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

  private notifyReauthenticationRequired(account: CrmRuntimeAccount) {
    return notifyCrmReauthentication(
      this.prisma,
      this.notifications,
      this.notificationPublisher,
      account,
    );
  }
  private reconcileRevokedAccountNotifications() {
    return reconcileCrmRevokedNotifications(
      this.prisma,
      this.notifications,
      this.notificationPublisher,
      (account) => this.notifyReauthenticationRequired(account),
    );
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
