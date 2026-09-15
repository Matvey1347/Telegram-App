import {
  TelegramManagedPostIdVerificationStatus,
  TelegramManagedPostOrigin,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { normalizePostGroupNumbering } from './post-groups.helpers';

export async function removeConfirmedMissingTelegramImport(
  prisma: PrismaService,
  post: {
    id: string;
    workspaceId: string;
    telegramChannelId: string;
    remoteImportKey: string;
    groupId: string | null;
    telegramScheduledMessageIds: string[];
    telegramMessageIds: string[];
  },
) {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.telegramManagedPost.deleteMany({
      where: {
        id: post.id,
        workspaceId: post.workspaceId,
        telegramChannelId: post.telegramChannelId,
        origin: TelegramManagedPostOrigin.TELEGRAM,
        remoteImportKey: post.remoteImportKey,
        status: TelegramManagedPostStatus.SCHEDULED,
        telegramIdVerificationStatus:
          TelegramManagedPostIdVerificationStatus.MISSING,
        telegramScheduledMessageIds: {
          equals: post.telegramScheduledMessageIds,
        },
        telegramMessageIds: { equals: post.telegramMessageIds },
      },
    });
    if (deleted.count === 1 && post.groupId) {
      await normalizePostGroupNumbering(tx, post.groupId);
    }
    return deleted.count === 1;
  });
}
