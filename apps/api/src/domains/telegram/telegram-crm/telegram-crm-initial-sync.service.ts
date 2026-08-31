import { Injectable } from '@nestjs/common';
import type { CrmInitialSyncResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmBatchStoreService } from './telegram-crm-batch-store.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';

const DIALOG_PAGE_SIZE = 100;
const MAX_SCANNED_DIALOGS = 2_000;
const MAX_IMPORTED_DIALOGS = 1_000;

@Injectable()
export class TelegramCrmInitialSyncService {
  private readonly running = new Map<string, Promise<CrmInitialSyncResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly batchStore: TelegramCrmBatchStoreService,
  ) {}

  async run(userId: string, accountId: string) {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.editAny',
    );
    const key = `${access.workspaceId}:${accountId}`;
    const current = this.running.get(key);
    if (current) return current;
    const operation = this.execute(access.workspaceId, accountId).finally(
      () => {
        this.running.delete(key);
      },
    );
    this.running.set(key, operation);
    return operation;
  }

  private async execute(
    workspaceId: string,
    accountId: string,
  ): Promise<CrmInitialSyncResult> {
    const existing = await this.prisma.telegramCrmAccountSyncState.findFirst({
      where: { mtprotoAccountId: accountId, workspaceId },
      select: { initialImportStatus: true, initialImportCursor: true },
    });
    if (existing?.initialImportStatus === 'COMPLETED') {
      return {
        accountId,
        scannedDialogs: 0,
        importedPeers: 0,
        importedConversations: 0,
        importedMessages: 0,
        nextCursor: null,
        exhausted: true,
      };
    }
    await this.prisma.telegramCrmAccountSyncState.upsert({
      where: { mtprotoAccountId: accountId },
      create: {
        mtprotoAccountId: accountId,
        workspaceId,
        initialImportStatus: 'IN_PROGRESS',
        initialImportCursor: existing?.initialImportCursor ?? null,
        status: 'SYNCING',
      },
      update: {
        initialImportStatus: 'IN_PROGRESS',
        status: 'SYNCING',
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    let scannedDialogs = 0;
    let importedPeers = 0;
    let importedConversations = 0;
    let processedEligibleDialogs = 0;
    let importedMessages = 0;
    let cursor = existing?.initialImportCursor ?? null;
    let exhausted = false;
    try {
      await this.runtime.withAccountHandle(
        workspaceId,
        accountId,
        'sync',
        async (handle) => {
          while (
            scannedDialogs < MAX_SCANNED_DIALOGS &&
            processedEligibleDialogs < MAX_IMPORTED_DIALOGS
          ) {
            const page = await handle.listPrivateDialogs({
              cursor,
              limit: Math.min(
                DIALOG_PAGE_SIZE,
                MAX_SCANNED_DIALOGS - scannedDialogs,
                MAX_IMPORTED_DIALOGS - processedEligibleDialogs,
              ),
            });
            scannedDialogs += page.scanned;
            const dialogs = page.dialogs;
            const stored = await this.batchStore.importDialogs({
              workspaceId,
              accountId,
              dialogs,
            });
            importedPeers += stored.importedPeers;
            processedEligibleDialogs += dialogs.length;
            importedConversations += stored.importedConversations;
            importedMessages += stored.importedMessages;
            cursor = page.nextCursor;
            exhausted = page.exhausted;
            await this.prisma.telegramCrmAccountSyncState.updateMany({
              where: {
                mtprotoAccountId: accountId,
                workspaceId,
                NOT: { initialImportCursor: cursor },
              },
              data: { initialImportCursor: cursor },
            });
            if (exhausted || !cursor || page.scanned === 0) break;
          }
        },
      );
      await this.prisma.telegramCrmAccountSyncState.update({
        where: { mtprotoAccountId: accountId },
        data: {
          initialImportStatus: exhausted ? 'COMPLETED' : 'IN_PROGRESS',
          initialImportCursor: cursor,
          status: 'IDLE',
          lastErrorCode: null,
          lastErrorMessage: null,
          lastMeaningfulSyncAt: new Date(),
        },
      });
      if (exhausted) {
        await this.runtime.wakeAccount(accountId, workspaceId);
      }
      return {
        accountId,
        scannedDialogs,
        importedPeers,
        importedConversations,
        importedMessages,
        nextCursor: cursor,
        exhausted,
      };
    } catch (error) {
      await this.prisma.telegramCrmAccountSyncState.updateMany({
        where: { mtprotoAccountId: accountId, workspaceId },
        data: {
          initialImportStatus: 'FAILED',
          status: 'FAILED',
          lastErrorCode: 'INITIAL_SYNC_FAILED',
          lastErrorMessage:
            error instanceof Error
              ? error.message.slice(0, 1_000)
              : String(error),
        },
      });
      throw error;
    }
  }
}
