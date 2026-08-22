import { BadRequestException, Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelSchemaCompatibilityService } from './telegram-channel-schema-compatibility.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import {
  ResolvedTelegramImportPolicy,
  TelegramImportPolicyInput,
} from './telegram-channels.internal';

@Injectable()
export class TelegramChannelImportPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramChannelSchemaCompatibilityService: TelegramChannelSchemaCompatibilityService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
  ) {}

  ensureStorageAvailable() {
    return this.telegramChannelSchemaCompatibilityService.ensureTelegramChannelImportPolicyColumnsAvailable();
  }

  public async validatePurchaseTransaction(
    workspaceId: string,
    channelId: string | null,
    purchaseTransactionId: string | null,
  ) {
    if (!purchaseTransactionId) return null;
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: purchaseTransactionId, workspaceId },
      select: {
        id: true,
        workspaceId: true,
        type: true,
      },
    });
    if (!transaction) {
      throw new BadRequestException(
        'Purchase transaction was not found in this workspace.',
      );
    }
    if (transaction.type !== TransactionType.expense) {
      throw new BadRequestException(
        'Purchase transaction must be an expense transaction.',
      );
    }
    const linkedChannel = await (this.prisma.telegramChannel as any).findFirst({
      where: { purchaseTransactionId },
      select: { id: true },
    });
    if (linkedChannel?.id && linkedChannel.id !== channelId) {
      throw new BadRequestException(
        'This transaction is already linked to another Telegram channel.',
      );
    }
    return transaction.id;
  }

  public async resolveImportPolicy(params: {
    workspaceId: string;
    channelId?: string | null;
    input?: TelegramImportPolicyInput;
    existing?: {
      acquisitionType?: 'CREATED' | 'PURCHASED' | null;
      postsSyncFrom?: Date | null;
      inviteLinksSyncFrom?: Date | null;
      purchaseTransactionId?: string | null;
    } | null;
    defaultNow?: Date;
  }) {
    await this.telegramChannelSchemaCompatibilityService.ensureTelegramChannelImportPolicyColumnsAvailable();
    const {
      workspaceId,
      channelId = null,
      input,
      existing,
      defaultNow,
    } = params;
    const now = defaultNow ?? new Date();
    const postsSyncFromInput =
      this.telegramChannelsSupportService.toOptionalDate(input?.postsSyncFrom);
    const inviteLinksSyncFromInput =
      this.telegramChannelsSupportService.toOptionalDate(
        input?.inviteLinksSyncFrom,
      );
    const acquisitionType =
      input?.acquisitionType === undefined
        ? (existing?.acquisitionType ?? 'CREATED')
        : input.acquisitionType === 'PURCHASED'
          ? 'PURCHASED'
          : 'CREATED';
    const postsSyncFrom =
      postsSyncFromInput === undefined
        ? existing
          ? (existing.postsSyncFrom ?? null)
          : now
        : postsSyncFromInput;
    const inviteLinksSyncFrom =
      inviteLinksSyncFromInput === undefined
        ? existing
          ? (existing.inviteLinksSyncFrom ?? null)
          : now
        : inviteLinksSyncFromInput;
    const purchaseTransactionId =
      input?.purchaseTransactionId === undefined
        ? (existing?.purchaseTransactionId ?? null)
        : input.purchaseTransactionId;

    return {
      acquisitionType,
      postsSyncFrom,
      inviteLinksSyncFrom,
      purchaseTransactionId: await this.validatePurchaseTransaction(
        workspaceId,
        channelId,
        purchaseTransactionId ?? null,
      ),
    } satisfies ResolvedTelegramImportPolicy;
  }

  async resolveChannelImportPolicy(params: {
    workspaceId: string;
    channelId?: string | null;
    input?: TelegramImportPolicyInput;
    existing?: {
      acquisitionType?: 'CREATED' | 'PURCHASED' | null;
      postsSyncFrom?: Date | null;
      inviteLinksSyncFrom?: Date | null;
      purchaseTransactionId?: string | null;
    } | null;
    defaultNow?: Date;
  }) {
    return this.resolveImportPolicy(params);
  }
}
