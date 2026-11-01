import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { TelegramCrmMtprotoHandle } from '../../../telegram/shared/mtproto/telegram-crm-mtproto.types';
import type { CrmRuntimeAccount } from './telegram-crm-account-session.service';
import { syncCrmDialogFolders } from './telegram-crm-folder-sync';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';

/** Event-triggered, bounded metadata reconciliation using the already owned transport. */
@Injectable()
export class TelegramCrmFolderRefreshService {
  private readonly marking = new Map<string, Promise<void>>();
  waitForMarkers(accountId: string) {
    return this.marking.get(accountId) ?? Promise.resolve();
  }
  abandonTargeted(accountId: string) {
    this.targetOnly.delete(accountId);
    this.retryNeeded.add(accountId);
  }
  private readonly targetOnly = new Set<string>();
  async markDirty(account: CrmRuntimeAccount, targeted = false) {
    const prior = this.marking.get(account.id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prior.catch(() => undefined).then(() => gate);
    this.marking.set(account.id, tail);
    await prior.catch(() => undefined);
    try {
      return await this.persistDirty(account, targeted);
    } finally {
      release();
      if (this.marking.get(account.id) === tail)
        this.marking.delete(account.id);
    }
  }
  private async persistDirty(account: CrmRuntimeAccount, targeted: boolean) {
    const state = await this.prisma.telegramCrmAccountSyncState.upsert({
      where: { mtprotoAccountId: account.id, workspaceId: account.workspaceId },
      create: {
        mtprotoAccountId: account.id,
        workspaceId: account.workspaceId,
        folderRefreshVersion: 1,
      },
      update: { folderRefreshVersion: { increment: 1 } },
      select: { folderRefreshVersion: true, folderReconciledVersion: true },
    });
    if (!targeted) this.targetOnly.delete(account.id);
    else if (state.folderRefreshVersion - 1 === state.folderReconciledVersion)
      this.targetOnly.add(account.id);
    return {
      targeted: targeted && this.targetOnly.has(account.id),
      version: state.folderRefreshVersion,
    };
  }
  async resumePending(
    account: CrmRuntimeAccount,
    handle: TelegramCrmMtprotoHandle,
    isCurrent: () => boolean,
    signal?: AbortSignal,
  ) {
    const pending = await this.prisma.$queryRaw<
      Array<{ id: string; version: number }>
    >`SELECT "mtprotoAccountId" AS id, "folderRefreshVersion" AS version FROM "TelegramCrmAccountSyncState" WHERE "mtprotoAccountId" = ${account.id} AND "workspaceId" = ${account.workspaceId} AND "folderRefreshVersion" > "folderReconciledVersion"`;
    if (pending.length && isCurrent())
      await this.request(
        account,
        handle,
        isCurrent,
        signal,
        undefined,
        pending[0].version,
      );
  }

  private activeScans = 0;
  private readonly scanWaiters: Array<() => void> = [];
  private readonly scanTails = new Map<string, Promise<void>>();
  async withAccountScan<T>(
    accountId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const prior = this.scanTails.get(accountId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prior.catch(() => undefined).then(() => gate);
    this.scanTails.set(accountId, tail);
    await prior.catch(() => undefined);
    if (this.activeScans >= 3)
      await new Promise<void>((resolve) => this.scanWaiters.push(resolve));
    else this.activeScans += 1;
    try {
      return await operation();
    } finally {
      const next = this.scanWaiters.shift();
      if (next) next();
      else this.activeScans -= 1;
      release();
      if (this.scanTails.get(accountId) === tail)
        this.scanTails.delete(accountId);
    }
  }

  private readonly logger = new Logger(TelegramCrmFolderRefreshService.name);
  private readonly retryNeeded = new Set<string>();
  needsRetry(accountId: string) {
    return this.retryNeeded.has(accountId);
  }
  private readonly running = new Map<
    string,
    {
      dirty: boolean;
      full: boolean;
      version?: number;
      userIds: Set<string>;
      done: Promise<void>;
      latest: {
        account: CrmRuntimeAccount;
        handle: TelegramCrmMtprotoHandle;
        isCurrent: () => boolean;
        signal?: AbortSignal;
      };
    }
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: TelegramCrmEventHub,
  ) {}

  request(
    account: CrmRuntimeAccount,
    handle: TelegramCrmMtprotoHandle,
    isCurrent: () => boolean,
    signal?: AbortSignal,
    userIds?: string[],
    version?: number,
  ) {
    const key = account.id;
    const existing = this.running.get(key);
    if (existing) {
      existing.latest = { account, handle, isCurrent, signal };
      existing.dirty = true;
      existing.full ||= userIds === undefined || version === undefined;
      existing.version =
        Math.max(existing.version ?? 0, version ?? 0) || undefined;
      userIds?.forEach((id) => existing.userIds.add(id));
      return existing.done;
    }
    const state = {
      dirty: true,
      full: userIds === undefined || version === undefined,
      version,
      userIds: new Set(userIds),
      done: Promise.resolve(),
      latest: { account, handle, isCurrent, signal },
    };
    this.running.set(key, state);
    state.done = (async () => {
      try {
        while (state.dirty) {
          state.dirty = false;
          const latest = state.latest;
          let pendingIds = state.full ? undefined : [...state.userIds];
          const includedVersion = state.version;
          state.version = undefined;
          state.full = false;
          state.userIds.clear();
          if (!latest.isCurrent()) {
            this.retryNeeded.add(key);
            this.targetOnly.delete(key);
            continue;
          }
          const revision =
            includedVersion ??
            (
              await this.prisma.telegramCrmAccountSyncState.findUnique({
                where: {
                  mtprotoAccountId: account.id,
                  workspaceId: account.workspaceId,
                },
                select: { folderRefreshVersion: true },
              })
            )?.folderRefreshVersion ??
            0;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              await this.withAccountScan(key, () =>
                pendingIds
                  ? this.refreshPeers(
                      latest.account,
                      latest.handle,
                      latest.isCurrent,
                      pendingIds,
                    )
                  : this.refresh(
                      latest.account,
                      latest.handle,
                      latest.isCurrent,
                    ),
              );
              if (pendingIds && !this.targetOnly.has(key)) {
                state.dirty = true;
                state.full = true;
                state.version = revision;
                break;
              }
              if (latest.isCurrent()) {
                const acknowledged =
                  await this.prisma.telegramCrmAccountSyncState.updateMany({
                    where: {
                      mtprotoAccountId: account.id,
                      workspaceId: account.workspaceId,
                      folderRefreshVersion: revision,
                    },
                    data: { folderReconciledVersion: revision },
                  });
                if (acknowledged.count) {
                  this.retryNeeded.delete(key);
                  this.targetOnly.delete(key);
                } else this.retryNeeded.add(key);
              } else {
                this.retryNeeded.add(key);
                this.targetOnly.delete(key);
              }
              break;
            } catch (error) {
              if (
                pendingIds &&
                error instanceof Error &&
                [
                  'CRM_FOLDER_PEER_HASH_UNAVAILABLE',
                  'CRM_FOLDER_PEER_DIALOGS_INCOMPLETE',
                ].includes(error.message)
              ) {
                pendingIds = undefined;
                attempt -= 1;
                continue;
              }
              if (
                attempt > 0 ||
                !latest.isCurrent() ||
                (error instanceof Error &&
                  error.message.startsWith('CRM_FOLDER_REFRESH_'))
              )
                throw error;
              await new Promise<void>((resolve) => {
                const done = () => {
                  clearTimeout(timer);
                  latest.signal?.removeEventListener('abort', done);
                  resolve();
                };
                const timer = setTimeout(done, 100);
                latest.signal?.addEventListener('abort', done, { once: true });
                if (latest.signal?.aborted) done();
              });
              if (!latest.isCurrent())
                throw new Error('CRM_FOLDER_REFRESH_SUPERSEDED');
            }
          }
        }
      } catch (error) {
        this.targetOnly.delete(key);
        this.retryNeeded.add(key);
        while (this.retryNeeded.size > 1000) {
          const first = [...this.retryNeeded][0];
          if (first) this.retryNeeded.delete(first);
        }
        if (state.latest.isCurrent())
          this.logger.warn(
            'Telegram CRM folder refresh failed; retrying on the next active account request',
          );
        throw error;
      } finally {
        if (this.running.get(key) === state) this.running.delete(key);
      }
    })();
    return state.done;
  }

  private async refreshPeers(
    account: CrmRuntimeAccount,
    handle: TelegramCrmMtprotoHandle,
    isCurrent: () => boolean,
    userIds: string[],
  ) {
    if (!handle.listPrivatePeerDialogs)
      throw new Error('CRM_FOLDER_PEER_DIALOGS_UNAVAILABLE');
    for (
      let offset = 0;
      offset < userIds.length && isCurrent();
      offset += 100
    ) {
      const conversations = await this.prisma.telegramCrmConversation.findMany({
        where: {
          workspaceId: account.workspaceId,
          mtprotoAccountId: account.id,
          peer: { telegramUserId: { in: userIds.slice(offset, offset + 100) } },
        },
        select: {
          id: true,
          telegramAccessHash: true,
          peer: { select: { telegramUserId: true } },
        },
      });
      if (!isCurrent()) return;
      const page = await handle.listPrivatePeerDialogs(
        conversations.map((row) => {
          if (!row.telegramAccessHash)
            throw new Error('CRM_FOLDER_PEER_HASH_UNAVAILABLE');
          return {
            telegramUserId: row.peer.telegramUserId,
            telegramAccessHash: row.telegramAccessHash,
          };
        }),
      );
      if (!isCurrent()) return;
      await this.prisma.$transaction(async (tx) => {
        await syncCrmDialogFolders(
          tx,
          {
            workspaceId: account.workspaceId,
            accountId: account.id,
            dialogs: page.dialogs,
            folders: page.folders,
            isCurrent,
          },
          new Map(
            conversations.map((row) => [row.peer.telegramUserId, row.id]),
          ),
        );
        if (!isCurrent()) throw new Error('CRM_FOLDER_REFRESH_SUPERSEDED');
      });
    }
    if (isCurrent())
      this.events.emit({
        type: 'folders.updated',
        workspaceId: account.workspaceId,
        occurredAt: new Date().toISOString(),
        ownerMemberId: null,
      });
  }

  private async refresh(
    account: CrmRuntimeAccount,
    handle: TelegramCrmMtprotoHandle,
    isCurrent: () => boolean,
  ) {
    let cursor: string | null = null;
    let complete = false;
    for (let pageIndex = 0; pageIndex < 100 && isCurrent(); pageIndex += 1) {
      const page = await handle.listPrivateDialogs({ cursor, limit: 100 });
      if (!isCurrent()) return;
      const conversations = await this.prisma.telegramCrmConversation.findMany({
        where: {
          workspaceId: account.workspaceId,
          mtprotoAccountId: account.id,
          peer: {
            telegramUserId: {
              in: page.dialogs.map((dialog) => dialog.peer.telegramUserId),
            },
          },
        },
        select: { id: true, peer: { select: { telegramUserId: true } } },
      });
      if (!isCurrent()) return;
      await this.prisma.$transaction(async (tx) => {
        if (!isCurrent()) return;
        await syncCrmDialogFolders(
          tx,
          {
            workspaceId: account.workspaceId,
            accountId: account.id,
            folders: page.folders,
            dialogs: page.dialogs,
            isCurrent,
          },
          new Map(
            conversations.map((row) => [row.peer.telegramUserId, row.id]),
          ),
        );
        if (!isCurrent()) throw new Error('CRM_FOLDER_REFRESH_SUPERSEDED');
      });
      if (page.exhausted) {
        complete = true;
        break;
      }
      if (!page.nextCursor || page.nextCursor === cursor || page.scanned === 0)
        throw new Error('CRM_FOLDER_REFRESH_CURSOR_STALLED');
      cursor = page.nextCursor;
    }
    if (isCurrent() && !complete)
      throw new Error('CRM_FOLDER_REFRESH_LIMIT_REACHED');
    if (isCurrent())
      this.events.emit({
        type: 'folders.updated',
        workspaceId: account.workspaceId,
        occurredAt: new Date().toISOString(),
        ownerMemberId: null,
      });
  }
}
