import { Injectable, Logger } from '@nestjs/common';
import type { CrmInitialSyncResult } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmBatchStoreService } from './telegram-crm-batch-store.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import type {
  TelegramCrmMtprotoDialog,
  TelegramCrmMtprotoHandle,
} from '../../../telegram/shared/telegram-crm-mtproto.types';

const DIALOG_PAGE_SIZE = 100;
const MAX_SCANNED_DIALOGS = 2_000;
const MAX_IMPORTED_DIALOGS = 1_000;
const RECENT_HISTORY_SIZE = 51;
const HISTORY_FETCH_CONCURRENCY = 4;
const HISTORY_STORE_CONVERSATIONS = 20;
const DAILY_OLDER_HISTORY_CONVERSATIONS = 20;

@Injectable()
export class TelegramCrmInitialSyncService {
  private readonly logger = new Logger(TelegramCrmInitialSyncService.name);
  private readonly running = new Map<string, Promise<CrmInitialSyncResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly runtime: TelegramCrmRuntimeManager,
    private readonly batchStore: TelegramCrmBatchStoreService,
    private readonly events: TelegramCrmEventHub = new TelegramCrmEventHub(),
  ) {}

  async run(userId: string, accountId: string) {
    const access = await this.authorization.require(
      userId,
      'adSales.crm.editAny',
    );
    return this.runForWorkspaceAccount(
      access.workspaceId,
      accountId,
      userId,
      access.memberId,
    );
  }

  async runWorkspace(workspaceId: string) {
    const accounts = await this.prisma.telegramUserAccountIntegration.findMany({
      where: {
        workspaceId,
        crmSyncEnabled: true,
        isActive: true,
        status: 'connected',
        sessionEncrypted: { not: null },
        sessionIv: { not: null },
        sessionAuthTag: { not: null },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        assignedMember: { select: { id: true, userId: true } },
      },
    });
    if (!accounts.length) {
      return {
        skipped: true,
        summary: 'No selected connected MTProto CRM sources.',
        details: { accountsProcessed: 0, accountsFailed: 0 },
      };
    }
    const fallbackMember = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, userId: true },
    });
    if (!fallbackMember)
      throw new Error('Workspace has no member for CRM attribution');

    const results: CrmInitialSyncResult[] = [];
    const failures: string[] = [];
    for (const account of accounts) {
      const actor = account.assignedMember ?? fallbackMember;
      try {
        results.push(
          await this.runForWorkspaceAccount(
            workspaceId,
            account.id,
            actor.userId,
            actor.id,
          ),
        );
      } catch {
        failures.push(account.id);
      }
    }
    if (failures.length) {
      throw new Error(
        `Telegram CRM sync failed for ${failures.length} of ${accounts.length} selected accounts`,
      );
    }
    return {
      summary: `Synchronized ${results.length} MTProto CRM sources; imported ${results.reduce((total, item) => total + item.importedMessages, 0)} messages.`,
      details: {
        accountsProcessed: results.length,
        accountsFailed: 0,
        importedMessages: results.reduce(
          (total, item) => total + item.importedMessages,
          0,
        ),
        importedConversations: results.reduce(
          (total, item) => total + item.importedConversations,
          0,
        ),
      },
    };
  }

  private runForWorkspaceAccount(
    workspaceId: string,
    accountId: string,
    userId: string,
    memberId: string,
  ) {
    const key = `${workspaceId}:${accountId}`;
    const current = this.running.get(key);
    if (current) return current;
    const operation = this.execute(
      workspaceId,
      accountId,
      userId,
      memberId,
    ).finally(() => this.running.delete(key));
    this.running.set(key, operation);
    return operation;
  }

  private async execute(
    workspaceId: string,
    accountId: string,
    userId: string,
    memberId: string,
  ): Promise<CrmInitialSyncResult> {
    const existing = await this.prisma.telegramCrmAccountSyncState.findFirst({
      where: { mtprotoAccountId: accountId, workspaceId },
      select: { initialImportStatus: true, initialImportCursor: true },
    });
    const refresh = existing?.initialImportStatus === 'COMPLETED';
    await this.prisma.telegramCrmAccountSyncState.upsert({
      where: { mtprotoAccountId: accountId },
      create: {
        mtprotoAccountId: accountId,
        workspaceId,
        initialImportStatus: 'IN_PROGRESS',
        initialImportCursor: refresh
          ? null
          : (existing?.initialImportCursor ?? null),
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
    let totalDialogs = 0;
    let cursor = refresh ? null : (existing?.initialImportCursor ?? null);
    const olderHistoryBudget = {
      remaining: refresh ? DAILY_OLDER_HISTORY_CONVERSATIONS : 0,
    };
    let exhausted = false;
    const emitProgress = (
      phase: 'STARTED' | 'RUNNING' | 'COMPLETED' | 'FAILED',
    ) => {
      this.events.emit({
        type: 'sync.progress',
        workspaceId,
        occurredAt: new Date().toISOString(),
        accountId,
        ownerMemberId: memberId,
        phase,
        scannedDialogs,
        importedPeers,
        importedConversations,
        importedMessages,
        current: scannedDialogs,
        total: Math.max(totalDialogs, scannedDialogs),
      });
    };
    emitProgress('STARTED');
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
            totalDialogs = Math.max(totalDialogs, page.total ?? scannedDialogs);
            const dialogs = page.dialogs;
            const stored = await this.batchStore.importDialogs({
              workspaceId,
              accountId,
              dialogs,
              autoContact: { ownerMemberId: memberId, createdByUserId: userId },
            });
            importedPeers += stored.importedPeers;
            processedEligibleDialogs += dialogs.length;
            importedConversations += stored.importedConversations;
            importedMessages += stored.importedMessages;
            importedMessages += await this.importMissingRecentHistory({
              workspaceId,
              accountId,
              dialogs,
              handle,
              olderHistoryBudget,
            });
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
            emitProgress('RUNNING');
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
      emitProgress('COMPLETED');
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
      try {
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
      } catch (persistenceError) {
        this.logger.warn(
          `Could not persist failed CRM sync state for account ${accountId}: ${persistenceError instanceof Error ? persistenceError.message : String(persistenceError)}`,
        );
      } finally {
        emitProgress('FAILED');
      }
      throw error;
    }
  }

  private async importMissingRecentHistory(input: {
    workspaceId: string;
    accountId: string;
    dialogs: TelegramCrmMtprotoDialog[];
    handle: TelegramCrmMtprotoHandle;
    olderHistoryBudget: { remaining: number };
  }) {
    if (!input.dialogs.length) return 0;
    const dialogByUserId = new Map(
      input.dialogs.map((dialog) => [dialog.peer.telegramUserId, dialog]),
    );
    const conversations = await this.prisma.telegramCrmConversation.findMany({
      where: {
        workspaceId: input.workspaceId,
        mtprotoAccountId: input.accountId,
        historyExhausted: false,
        peer: { telegramUserId: { in: [...dialogByUserId.keys()] } },
      },
      select: {
        id: true,
        contactId: true,
        telegramAccessHash: true,
        historyCursorTelegramMessageId: true,
        updatedAt: true,
        peer: { select: { telegramUserId: true } },
      },
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
    });
    const conversationsToImport = conversations.filter((conversation) => {
      if (conversation.historyCursorTelegramMessageId == null) return true;
      if (input.olderHistoryBudget.remaining <= 0) return false;
      input.olderHistoryBudget.remaining -= 1;
      return true;
    });
    if (!conversationsToImport.length) return 0;
    const histories = [] as Array<{
      conversation: { id: string; contactId: string | null };
      messages: Awaited<
        ReturnType<TelegramCrmMtprotoHandle['getHistory']>
      >['messages'];
      nextBeforeTelegramMessageId: number | null;
      exhausted: boolean;
    }>;
    for (
      let offset = 0;
      offset < conversationsToImport.length;
      offset += HISTORY_FETCH_CONCURRENCY
    ) {
      const chunk = conversationsToImport.slice(
        offset,
        offset + HISTORY_FETCH_CONCURRENCY,
      );
      histories.push(
        ...(await Promise.all(
          chunk.map(async (conversation) => {
            const dialog = dialogByUserId.get(
              conversation.peer.telegramUserId,
            )!;
            const history = await input.handle.getHistory({
              telegramUserId: conversation.peer.telegramUserId,
              telegramAccessHash:
                conversation.telegramAccessHash ??
                dialog.peer.telegramAccessHash,
              beforeTelegramMessageId:
                conversation.historyCursorTelegramMessageId,
              limit: RECENT_HISTORY_SIZE,
            });
            return {
              conversation: {
                id: conversation.id,
                contactId: conversation.contactId,
              },
              ...history,
            };
          }),
        )),
      );
    }
    let imported = 0;
    for (
      let offset = 0;
      offset < histories.length;
      offset += HISTORY_STORE_CONVERSATIONS
    ) {
      const stored = await this.batchStore.importHistoryBatch({
        workspaceId: input.workspaceId,
        accountId: input.accountId,
        histories: histories.slice(
          offset,
          offset + HISTORY_STORE_CONVERSATIONS,
        ),
      });
      imported += stored.imported;
    }
    return imported;
  }
}
