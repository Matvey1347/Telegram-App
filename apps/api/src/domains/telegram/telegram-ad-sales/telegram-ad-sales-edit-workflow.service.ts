import { Injectable } from '@nestjs/common';
import type { TelegramAdSaleEditWorkflowDto } from './dto';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

export type TelegramAdSaleEditProgress = {
  operation:
    | 'LOAD'
    | 'UPDATE_SALE'
    | 'UPDATE_PLACEMENT'
    | 'CREATE_POST'
    | 'SCHEDULE_POST'
    | 'ATTACH_POST'
    | 'UPDATE_PAYMENT'
    | 'REFRESH';
  message: string;
  placementId?: string;
  completed: string[];
  remaining: string[];
};

@Injectable()
export class TelegramAdSalesEditWorkflowService {
  constructor(private readonly sales: TelegramAdSalesService) {}

  async save(
    userId: string,
    saleId: string,
    dto: TelegramAdSaleEditWorkflowDto,
    onProgress: (
      item: TelegramAdSaleEditProgress,
      current: number,
      total: number,
    ) => void,
  ) {
    const currentSale = await this.sales.getSale(userId, saleId);
    const originalPlacements = new Map(
      (
        currentSale.placements as unknown as Array<{
          id: string;
          managedPostId?: string | null;
          status?: string;
        }>
      ).map((placement) => [placement.id, placement]),
    );
    const plan: Array<
      Pick<TelegramAdSaleEditProgress, 'operation' | 'message' | 'placementId'>
    > = [
      { operation: 'LOAD', message: 'Load current deal' },
      ...(dto.sale && Object.keys(dto.sale).length
        ? [
            {
              operation: 'UPDATE_SALE' as const,
              message: 'Update deal details',
            },
          ]
        : []),
      ...dto.placements.flatMap((placement) => [
        {
          operation: 'UPDATE_PLACEMENT' as const,
          message: 'Save placement price and schedule',
          placementId: placement.id,
        },
        ...(placement.managedPostDraft &&
        !originalPlacements.get(placement.id)?.managedPostId
          ? [
              {
                operation: 'CREATE_POST' as const,
                message: 'Create advertising post',
                placementId: placement.id,
              },
            ]
          : []),
        ...(placement.managedPostDraft &&
        originalPlacements.get(placement.id)?.status === 'RESERVED'
          ? [
              {
                operation: 'SCHEDULE_POST' as const,
                message: 'Schedule advertising post',
                placementId: placement.id,
              },
            ]
          : []),
        ...(placement.postAttachment
          ? [
              {
                operation: 'ATTACH_POST' as const,
                message: 'Link published post',
                placementId: placement.id,
              },
            ]
          : []),
      ]),
      ...dto.payments.map(() => ({
        operation: 'UPDATE_PAYMENT' as const,
        message: 'Update payment',
      })),
      { operation: 'REFRESH', message: 'Load saved deal data' },
    ];
    const total = plan.length;
    let current = 0;
    const report = (
      operation: TelegramAdSaleEditProgress['operation'],
      message: string,
      placementId?: string,
    ) => {
      const completed = [
        ...plan.slice(0, current).map((step) => step.message),
        message,
      ];
      current += 1;
      onProgress(
        {
          operation,
          message,
          placementId,
          completed,
          remaining: plan.slice(current).map((step) => step.message),
        },
        current,
        total,
      );
    };

    report('LOAD', 'Deal loaded; preparing requested changes');
    if (dto.sale && Object.keys(dto.sale).length) {
      await this.sales.updateSale(userId, saleId, dto.sale);
      report('UPDATE_SALE', 'Deal details saved');
    }

    for (const item of dto.placements) {
      const placement = await this.sales.updatePlacement(
        userId,
        saleId,
        item.id,
        {
          scheduledAt: item.scheduledAt,
          timezone: item.timezone,
          agreedPrice: item.agreedPrice,
          recommendedPrice: item.recommendedPrice ?? undefined,
          minimumPrice: item.minimumPrice ?? undefined,
          currency: item.currency,
          manualPriceReason: item.manualPriceReason,
          telegramAdProductId: item.telegramAdProductId,
          managedPostId: item.managedPostId,
        },
      );
      report('UPDATE_PLACEMENT', 'Placement price and schedule saved', item.id);

      let managedPostId = placement.managedPostId;
      if (item.managedPostDraft && !managedPostId) {
        const post = await this.sales.createManagedPostFromPlacement(
          userId,
          saleId,
          item.id,
          item.managedPostDraft,
        );
        managedPostId = post.id;
        report('CREATE_POST', 'Advertising post created', item.id);
      }

      if (
        item.managedPostDraft &&
        originalPlacements.get(item.id)?.status === 'RESERVED' &&
        managedPostId
      ) {
        await this.sales.schedulePlacement(userId, saleId, item.id, {
          scheduledAt: item.scheduledAt,
        });
        report('SCHEDULE_POST', 'Advertising post scheduled', item.id);
      }

      if (item.postAttachment) {
        await this.sales.attachManagedPost(
          userId,
          saleId,
          item.id,
          item.postAttachment,
        );
        report('ATTACH_POST', 'Published post linked', item.id);
      }
    }

    for (const payment of dto.payments) {
      await this.sales.updatePayment(userId, saleId, payment.id, payment);
      report('UPDATE_PAYMENT', 'Payment updated');
    }

    const sale = await this.sales.getSale(userId, saleId);
    report('REFRESH', 'Saved deal data loaded');
    return sale;
  }
}
