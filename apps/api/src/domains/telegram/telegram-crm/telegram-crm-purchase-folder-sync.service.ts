import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';

const folderKey = (value: string | null) => {
  const match = value?.match(/^TELEGRAM_FOLDER:([^:]+):(\d+)$/);
  return match ? { accountId: match[1], folderId: Number(match[2]) } : null;
};

/** Applies the configured customer tag to the matching Telegram dialogs. */
@Injectable()
export class TelegramCrmPurchaseFolderSyncService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly runtime?: TelegramCrmRuntimeManager,
  ) {}

  async sync(workspaceId: string, advertiserId: string) {
    if (!this.runtime) return;
    const setting = await this.prisma.telegramAdCrmWorkspaceSettings.findUnique(
      {
        where: { workspaceId },
        select: { purchaseTagId: true },
      },
    );
    if (!setting?.purchaseTagId) return;
    const tag = await this.prisma.telegramAdvertiserTag.findFirst({
      where: { id: setting.purchaseTagId, workspaceId },
      select: { systemKey: true },
    });
    const folder = folderKey(tag?.systemKey ?? null);
    if (!folder) return;
    const conversations = await this.prisma.telegramCrmConversation.findMany({
      where: {
        workspaceId,
        contactId: advertiserId,
        mtprotoAccountId: folder.accountId,
        telegramAccessHash: { not: null },
      },
      select: {
        telegramAccessHash: true,
        peer: { select: { telegramUserId: true } },
      },
    });
    if (!conversations.length) return;
    await this.runtime.withAccountHandle(
      workspaceId,
      folder.accountId,
      'sync',
      async (handle) => {
        for (const conversation of conversations) {
          await handle.setDialogFolderMembership({
            folderId: folder.folderId,
            telegramUserId: conversation.peer.telegramUserId,
            telegramAccessHash: conversation.telegramAccessHash!,
            included: true,
          });
        }
      },
    );
  }
}
