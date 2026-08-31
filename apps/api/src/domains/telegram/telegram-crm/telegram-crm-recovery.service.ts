import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  TelegramCrmMtprotoCheckpoint,
  TelegramCrmMtprotoHandle,
  TelegramCrmMtprotoPeer,
  TelegramCrmMtprotoUpdate,
} from '../../../telegram/shared/telegram-crm-mtproto.types';
import type { CrmRuntimeAccount } from './telegram-crm-account-session.service';
import { TelegramCrmBatchStoreService } from './telegram-crm-batch-store.service';

const UPDATE_BATCH_LIMIT = 100;
const MAX_RECOVERY_SLICES = 20;
const PEER_RESOLVE_CONCURRENCY = 5;

export type TelegramCrmRecoveryResult =
  | { outcome: 'SUCCESS'; checkpoint: TelegramCrmMtprotoCheckpoint }
  | { outcome: 'RETRY' }
  | { outcome: 'STOPPED' };

@Injectable()
export class TelegramCrmRecoveryService {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly batchStore: TelegramCrmBatchStoreService,
  ) {}

  async recover(input: {
    account: CrmRuntimeAccount;
    handle: TelegramCrmMtprotoHandle;
    captureQueue: () => TelegramCrmMtprotoUpdate[];
    isCurrent?: () => boolean;
  }): Promise<TelegramCrmRecoveryResult> {
    await this.acquire();
    try {
      if (input.isCurrent && !input.isCurrent()) return { outcome: 'STOPPED' };
      const syncState =
        await this.prisma.telegramCrmAccountSyncState.findUnique({
          where: { mtprotoAccountId: input.account.id },
          select: { incrementalCheckpoint: true },
        });
      let from = syncState?.incrementalCheckpoint
        ? this.parseCheckpoint(syncState.incrementalCheckpoint)
        : await input.handle.getState();
      if (!syncState?.incrementalCheckpoint) {
        const captured = input.captureQueue();
        await this.ensureUpdatePeers(input.account, input.handle, captured);
        for (
          let index = 0;
          index < captured.length || index === 0;
          index += UPDATE_BATCH_LIMIT
        ) {
          const chunk = captured.slice(index, index + UPDATE_BATCH_LIMIT);
          const finalChunk = index + UPDATE_BATCH_LIMIT >= captured.length;
          const baseline = await this.batchStore.applyUpdates({
            workspaceId: input.account.workspaceId,
            accountId: input.account.id,
            updates: chunk,
            checkpoint: finalChunk ? from : undefined,
          });
          if (baseline.needsRecovery) {
            throw new Error(
              'Unable to resolve Telegram peer during baseline recovery',
            );
          }
        }
      }
      for (let slice = 0; slice < MAX_RECOVERY_SLICES; slice += 1) {
        const difference = await input.handle.getDifference(from);
        if (difference.tooLong) {
          await this.markReimportRequired(
            input.account,
            new Error(
              'Telegram difference was truncated; run bounded initial sync again',
            ),
          );
          return { outcome: 'STOPPED' };
        }
        if (difference.peers.length) {
          await this.batchStore.importDialogs({
            workspaceId: input.account.workspaceId,
            accountId: input.account.id,
            dialogs: difference.peers.map((peer) => ({
              peer,
              telegramDialogId: peer.telegramUserId,
              unreadCount: 0,
              lastMessage: null,
            })),
            preserveUnread: true,
          });
        }
        const stored = await this.batchStore.applyUpdates({
          workspaceId: input.account.workspaceId,
          accountId: input.account.id,
          updates: difference.updates,
          checkpoint: difference.checkpoint,
        });
        if (stored.needsRecovery) {
          throw new Error('Telegram difference contains an unresolved peer');
        }
        from = difference.checkpoint;
        if (difference.final) {
          return { outcome: 'SUCCESS', checkpoint: from };
        }
      }
      await this.setMarker(input.account, `SLICE_LIMIT:${from.pts}`);
      return { outcome: 'RETRY' };
    } finally {
      this.release();
    }
  }

  async writeFailure(account: CrmRuntimeAccount, code: string, error: unknown) {
    const message =
      error instanceof Error ? error.message.slice(0, 1_000) : String(error);
    await this.prisma.telegramCrmAccountSyncState.upsert({
      where: { mtprotoAccountId: account.id },
      create: {
        mtprotoAccountId: account.id,
        workspaceId: account.workspaceId,
        status: 'FAILED',
        lastErrorCode: code,
        lastErrorMessage: message,
      },
      update: {
        status: 'FAILED',
        lastErrorCode: code,
        lastErrorMessage: message,
      },
    });
  }

  private async markReimportRequired(
    account: CrmRuntimeAccount,
    error: unknown,
  ) {
    const message =
      error instanceof Error ? error.message.slice(0, 1_000) : String(error);
    await this.prisma.telegramCrmAccountSyncState.upsert({
      where: { mtprotoAccountId: account.id },
      create: {
        mtprotoAccountId: account.id,
        workspaceId: account.workspaceId,
        status: 'FAILED',
        initialImportStatus: 'NOT_STARTED',
        initialImportCursor: null,
        incrementalCheckpoint: null,
        recoveryCheckpoint: 'DIFFERENCE_TOO_LONG',
        lastErrorCode: 'DIFFERENCE_TOO_LONG_REIMPORT_REQUIRED',
        lastErrorMessage: message,
      },
      update: {
        status: 'FAILED',
        initialImportStatus: 'NOT_STARTED',
        initialImportCursor: null,
        incrementalCheckpoint: null,
        recoveryCheckpoint: 'DIFFERENCE_TOO_LONG',
        lastErrorCode: 'DIFFERENCE_TOO_LONG_REIMPORT_REQUIRED',
        lastErrorMessage: message,
      },
    });
  }

  async setMarker(account: CrmRuntimeAccount, marker: string) {
    await this.prisma.telegramCrmAccountSyncState.upsert({
      where: { mtprotoAccountId: account.id },
      create: {
        mtprotoAccountId: account.id,
        workspaceId: account.workspaceId,
        status: 'RECOVERING',
        recoveryCheckpoint: marker,
      },
      update: { status: 'RECOVERING', recoveryCheckpoint: marker },
    });
  }

  private async ensureUpdatePeers(
    account: CrmRuntimeAccount,
    handle: TelegramCrmMtprotoHandle,
    updates: TelegramCrmMtprotoUpdate[],
  ) {
    const userIds = [
      ...new Set(
        updates.flatMap((update) =>
          update.type === 'message.new' || update.type === 'message.edited'
            ? [update.message.telegramUserId]
            : [],
        ),
      ),
    ];
    if (!userIds.length) return;
    const known = await this.prisma.telegramCrmConversation.findMany({
      where: {
        workspaceId: account.workspaceId,
        mtprotoAccountId: account.id,
        peer: { telegramUserId: { in: userIds } },
      },
      select: { peer: { select: { telegramUserId: true } } },
    });
    const knownIds = new Set(known.map((row) => row.peer.telegramUserId));
    const unresolved = userIds.filter((id) => !knownIds.has(id));
    const peers: TelegramCrmMtprotoPeer[] = [];
    for (
      let index = 0;
      index < unresolved.length;
      index += PEER_RESOLVE_CONCURRENCY
    ) {
      peers.push(
        ...(await Promise.all(
          unresolved
            .slice(index, index + PEER_RESOLVE_CONCURRENCY)
            .map((telegramUserId) =>
              handle.resolvePrivatePeer({ telegramUserId }),
            ),
        )),
      );
    }
    if (!peers.length) return;
    await this.batchStore.importDialogs({
      workspaceId: account.workspaceId,
      accountId: account.id,
      dialogs: peers.map((peer) => ({
        peer,
        telegramDialogId: peer.telegramUserId,
        unreadCount: 0,
        lastMessage: null,
      })),
      preserveUnread: true,
    });
  }

  private parseCheckpoint(value: string) {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    for (const key of ['pts', 'qts', 'date', 'seq']) {
      if (!Number.isInteger(parsed[key])) {
        throw new Error('Invalid CRM sync checkpoint');
      }
    }
    return parsed as TelegramCrmMtprotoCheckpoint;
  }

  private async acquire() {
    if (this.active < 2) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  private release() {
    this.active = Math.max(0, this.active - 1);
    this.waiters.shift()?.();
  }
}
