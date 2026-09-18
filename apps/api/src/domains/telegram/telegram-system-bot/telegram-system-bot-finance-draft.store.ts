import { ConflictException } from '@nestjs/common';
import {
  TelegramSystemBotFinanceDraftKind,
  TelegramSystemBotFinanceDraftStatus,
  type TransactionType,
} from '@prisma/client';
import { TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE_ERROR_CODE } from '@telegram-system/shared';
import type { PrismaService } from '../../../prisma/prisma.service';
import { withSystemBotInteractionLock } from './telegram-system-bot-interaction-lock';

export function createSystemBotFinanceDraft(
  prisma: PrismaService,
  input: {
    connectionId: string;
    workspaceId: string;
    controlMessageId?: number;
  },
  kind: TelegramSystemBotFinanceDraftKind,
  expiresAt: Date,
  type?: TransactionType,
) {
  return withSystemBotInteractionLock(prisma, input, async (tx) => {
    const workflow = await tx.telegramSystemBotWorkflow.findFirst({
      where: {
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        kind: { in: ['POST_BATCH_IMPORT', 'WEBSITE_POST_IMPORT'] },
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (workflow) {
      throw new ConflictException({
        code: TELEGRAM_SYSTEM_BOT_IMPORT_ACTIVE_ERROR_CODE,
        message: 'Finish or cancel the active System Bot import first.',
      });
    }
    await tx.telegramSystemBotFinanceDraft.updateMany({
      where: {
        connectionId: input.connectionId,
        status: TelegramSystemBotFinanceDraftStatus.PENDING,
      },
      data: { status: TelegramSystemBotFinanceDraftStatus.EXPIRED },
    });
    return tx.telegramSystemBotFinanceDraft.create({
      data: {
        connectionId: input.connectionId,
        workspaceId: input.workspaceId,
        kind,
        type,
        controlMessageId: input.controlMessageId,
        expiresAt,
      },
    });
  });
}
