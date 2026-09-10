import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramAdSalePaymentStatus } from '@prisma/client';
import type {
  DeleteTelegramAdSalePaymentOptions,
  TelegramAdSalePaymentDeletionResult,
} from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

@Injectable()
export class TelegramAdSalePaymentDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly adSales: TelegramAdSalesService,
  ) {}

  async deleteActivePayment(
    userId: string,
    saleId: string,
    paymentId: string,
    options: DeleteTelegramAdSalePaymentOptions = {},
  ): Promise<TelegramAdSalePaymentDeletionResult> {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const payment = await this.prisma.telegramAdSalePayment.findFirst({
      where: { id: paymentId, workspaceId, telegramAdSaleId: saleId },
      select: {
        id: true,
        transactionId: true,
        reversalTransactionId: true,
        status: true,
        sale: { select: { advertiserId: true } },
      },
    });
    if (!payment) {
      throw new NotFoundException('Telegram ad sale payment not found');
    }
    if (
      payment.status === TelegramAdSalePaymentStatus.VOIDED ||
      payment.reversalTransactionId
    ) {
      throw new BadRequestException(
        'Voided payments cannot be deleted because their reversal history must be preserved',
      );
    }

    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramAdSalePayment.delete({
        where: { id: payment.id, workspaceId },
      });
      if (payment.transactionId) {
        await tx.transaction.updateMany({
          where: { id: payment.transactionId, workspaceId, deletedAt: null },
          data: { deletedAt },
        });
      }
      if (options.clearDealAmount) {
        await tx.telegramAdSalePlacement.updateMany({
          where: { workspaceId, telegramAdSaleId: saleId },
          data: { agreedPrice: 0 },
        });
      }
    });
    if (payment.sale.advertiserId) {
      await this.adSales.recalculateAdvertiserStats(
        workspaceId,
        payment.sale.advertiserId,
      );
    }
    return {
      paymentId: payment.id,
      transactionId: payment.transactionId,
      dealAmountCleared: Boolean(options.clearDealAmount),
    };
  }
}
