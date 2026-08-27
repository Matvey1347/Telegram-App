import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramAdPlacementStatus,
  TelegramAdPricingMode,
  TelegramAdSaleOrigin,
  TelegramAdSaleStatus,
  TelegramManagedPostStatus,
} from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { splitTelegramAdSalesBotTotalPrice } from './domain/bot-total-price-split';
import { TelegramAdSalesBotDeletionPreflightService } from './telegram-ad-sales-bot-deletion-preflight.service';
import { TelegramAdSalesBotExistingPlacementService } from './telegram-ad-sales-bot-existing-placement.service';
import { TelegramAdSalesBotTargetsService } from './telegram-ad-sales-bot-targets.service';
import { TelegramAdSalesBotReservationService } from './telegram-ad-sales-bot-reservation.service';
import type {
  TelegramAdSalesBotCommitInput,
  TelegramAdSalesBotSale,
} from './telegram-ad-sales-bot-command.types';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

type BotPlacement = TelegramAdSalesBotSale['placements'][number];

@Injectable()
export class TelegramAdSalesBotCommandExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly sales: TelegramAdSalesService,
    private readonly targets: TelegramAdSalesBotTargetsService,
    private readonly existingPlacements: TelegramAdSalesBotExistingPlacementService,
    private readonly deletionPreflight: TelegramAdSalesBotDeletionPreflightService,
    private readonly reservations: TelegramAdSalesBotReservationService,
  ) {}

  async commit(userId: string, input: TelegramAdSalesBotCommitInput) {
    const commandId = input.commandId.trim();
    if (!commandId) throw new BadRequestException('commandId is required');
    this.assertContentInput(input);
    const assignment = await this.workspaceService.resolveAssignedMemberId(
      userId,
      input.assignedMemberId,
    );
    if (!assignment.assignedMemberId) {
      throw new BadRequestException('Assigned member is required');
    }

    if (input.existingPlacementId) {
      return this.commitExistingPlacement(userId, input, commandId, assignment);
    }
    return this.commitNewSale(userId, input, commandId, assignment);
  }

  private async commitNewSale(
    userId: string,
    input: TelegramAdSalesBotCommitInput,
    commandId: string,
    assignment: Awaited<
      ReturnType<WorkspaceService['resolveAssignedMemberId']>
    >,
  ) {
    const target = await this.resolveNewTarget(userId, input);
    if (input.existingManagedPostId && target.channelIds.length !== 1) {
      throw new BadRequestException(
        'An existing managed post can only be attached to one channel',
      );
    }
    const scheduledAt = this.scheduledAt(input);
    const productIds = target.channelIds.map(
      (channelId) => target.productIdsByChannel[channelId],
    );
    const [account, products, managedPost] = await Promise.all([
      this.account(assignment.workspaceId, input),
      this.prisma.telegramAdProduct.findMany({
        where: {
          id: { in: productIds },
          workspaceId: assignment.workspaceId,
          isActive: true,
        },
        select: { id: true, telegramChannelId: true, currency: true },
      }),
      input.existingManagedPostId
        ? this.managedPost(
            assignment.workspaceId,
            target.channelIds[0],
            input.existingManagedPostId,
          )
        : Promise.resolve(null),
    ]);
    if (products.length !== target.channelIds.length) {
      throw new NotFoundException('Standard Telegram ad product not found');
    }
    if (input.deliveryAction !== 'SKIP_POST') {
      await this.deletionPreflight.assertAvailable({
        workspaceId: assignment.workspaceId,
        channelIds: target.channelIds,
        format: target,
        content: managedPost ?? input.post ?? {},
      });
    }

    const shares = input.finance
      ? splitTelegramAdSalesBotTotalPrice(
          input.finance.amount,
          target.channelIds,
          target.audienceWeightsByChannel,
        )
      : target.channelIds.map((channelId) => ({ channelId, amount: 0 }));
    const productByChannel = new Map(
      products.map((product) => [product.telegramChannelId, product] as const),
    );
    const settlementCurrency = account?.currency ?? products[0].currency;
    const reservation = {
      advertiserName: input.advertiserLabel?.trim() || 'Telegram advertiser',
      origin: TelegramAdSaleOrigin.DIRECT,
      settlementCurrency,
      assignedMemberId: assignment.assignedMemberId,
      placements: shares.map((share) => {
        const product = productByChannel.get(share.channelId)!;
        return {
          telegramChannelId: share.channelId,
          telegramChannelNetworkId: target.networkId,
          telegramAdProductId: product.id,
          scheduledAt: scheduledAt.toISOString(),
          timezone: assignment.currentMembership.workspace.timezone,
          pricingMode: TelegramAdPricingMode.MANUAL,
          agreedPrice: share.amount,
          expectedViews: 0,
          recommendedPrice: 0,
          minimumPrice: 0,
          currency: account?.currency ?? product.currency,
          manualPriceReason: input.finance
            ? 'Recorded through Telegram System Bot'
            : 'Price not recorded through Telegram System Bot',
        };
      }),
    };
    const { sale, idempotencyKey } = await this.reservations.reserve({
      userId,
      workspaceId: assignment.workspaceId,
      commandId,
      command: input,
      reservation,
      account,
    });
    await this.deliverPlacements(
      userId,
      assignment.workspaceId,
      assignment.assignedMemberId!,
      sale,
      input,
      managedPost?.id ?? null,
      scheduledAt,
    );
    return this.result(userId, sale.id, idempotencyKey, input.deliveryAction);
  }

  private async commitExistingPlacement(
    userId: string,
    input: TelegramAdSalesBotCommitInput,
    commandId: string,
    assignment: Awaited<
      ReturnType<WorkspaceService['resolveAssignedMemberId']>
    >,
  ) {
    if (
      input.finance ||
      input.target ||
      input.formatName ||
      input.existingSaleId
    ) {
      throw new BadRequestException(
        'Existing placement commands cannot create a sale or payment',
      );
    }
    if (input.deliveryAction === 'SKIP_POST') {
      throw new BadRequestException('Existing placement requires post content');
    }
    const claimed = await this.existingPlacements.claim(
      userId,
      assignment.workspaceId,
      input.existingPlacementId!,
      commandId,
    );
    const scheduledAt = this.scheduledAt(input, claimed.scheduledAt);
    const managedPost = input.existingManagedPostId
      ? await this.managedPost(
          assignment.workspaceId,
          claimed.channelId,
          input.existingManagedPostId,
        )
      : null;
    await this.deletionPreflight.assertAvailable({
      workspaceId: assignment.workspaceId,
      channelIds: [claimed.channelId],
      format: {
        deleteAfterHours: claimed.deleteAfterHours,
        isPermanent: claimed.isPermanent,
      },
      content: managedPost ?? input.post ?? {},
    });

    if (
      input.deliveryAction !== 'SAVE_DRAFT' &&
      claimed.saleStatus === TelegramAdSaleStatus.DRAFT
    ) {
      await this.sales.reserveSale(userId, claimed.saleId, {
        placements: [
          {
            placementId: claimed.placementId,
            scheduledAt: scheduledAt.toISOString(),
          },
        ],
      });
    }
    let sale = (await this.sales.getSale(
      userId,
      claimed.saleId,
    )) as TelegramAdSalesBotSale;
    if (input.deliveryAction !== 'SAVE_DRAFT') {
      sale = await this.reservations.confirm(userId, sale);
    }
    await this.deliverPlacements(
      userId,
      assignment.workspaceId,
      assignment.assignedMemberId!,
      sale,
      input,
      managedPost?.id ?? null,
      scheduledAt,
      claimed.placementId,
    );
    return this.result(
      userId,
      claimed.saleId,
      null,
      input.deliveryAction,
      claimed.placementId,
    );
  }

  private async deliverPlacements(
    userId: string,
    workspaceId: string,
    assignedMemberId: string,
    sale: TelegramAdSalesBotSale,
    input: TelegramAdSalesBotCommitInput,
    existingManagedPostId: string | null,
    scheduledAt: Date,
    onlyPlacementId?: string,
  ) {
    if (input.deliveryAction === 'SKIP_POST') return;
    const placements = onlyPlacementId
      ? sale.placements.filter((item) => item.id === onlyPlacementId)
      : sale.placements;
    if (!placements.length)
      throw new NotFoundException('Bot placement not found');
    for (let index = 0; index < placements.length; index += 5) {
      await Promise.all(
        placements.slice(index, index + 5).map((placement) =>
          this.deliverPlacement({
            userId,
            workspaceId,
            assignedMemberId,
            saleId: sale.id,
            placement,
            input,
            existingManagedPostId,
            scheduledAt,
          }),
        ),
      );
    }
  }

  private async deliverPlacement(params: {
    userId: string;
    workspaceId: string;
    assignedMemberId: string;
    saleId: string;
    placement: BotPlacement;
    input: TelegramAdSalesBotCommitInput;
    existingManagedPostId: string | null;
    scheduledAt: Date;
  }) {
    let placement = params.placement;
    let createdNow = false;
    if (!placement.managedPostId) {
      if (params.existingManagedPostId) {
        placement = (await this.sales.attachManagedPost(
          params.userId,
          params.saleId,
          placement.id,
          { managedPostId: params.existingManagedPostId },
        )) as BotPlacement;
      } else {
        const post = inputPost(params.input);
        const created = await this.sales.createManagedPostFromPlacement(
          params.userId,
          params.saleId,
          placement.id,
          {
            title: post.title,
            text: post.text,
            imageUrls: post.imageUrls,
            assignedMemberId: params.assignedMemberId,
            icon: post.icon,
            buttonRows: post.buttonRows,
          },
        );
        placement = { ...placement, managedPostId: created.id };
        createdNow = true;
      }
    }
    if (
      params.input.deliveryAction === 'SCHEDULE' &&
      placement.status !== TelegramAdPlacementStatus.SCHEDULED &&
      placement.status !== TelegramAdPlacementStatus.PUBLISHED
    ) {
      await this.sales.schedulePlacement(
        params.userId,
        params.saleId,
        placement.id,
        {
          scheduledAt: params.scheduledAt.toISOString(),
          longTextMode: params.input.post?.longTextMode,
        },
      );
    } else if (
      params.input.deliveryAction === 'PUBLISH_NOW' &&
      (placement.status !== TelegramAdPlacementStatus.PUBLISHED || createdNow)
    ) {
      await this.sales.publishPlacement(
        params.userId,
        params.saleId,
        placement.id,
        { longTextMode: params.input.post?.longTextMode },
      );
    }
  }

  private async resolveNewTarget(
    userId: string,
    input: TelegramAdSalesBotCommitInput,
  ) {
    const target =
      input.target ??
      (input.channelId
        ? { kind: 'CHANNELS' as const, channelIds: [input.channelId] }
        : null);
    if (!target) throw new BadRequestException('Target is required');
    const resolved = await this.targets.resolve(userId, target);
    const format = input.formatName
      ? resolved.formats.find((item) => item.name === input.formatName)
      : resolved.formats.find(
          (item) =>
            input.channelId &&
            item.productIdsByChannel[input.channelId] === input.productId,
        );
    if (!format) throw new NotFoundException('Common ad format not found');
    return { ...resolved, ...format };
  }

  private async account(
    workspaceId: string,
    input: TelegramAdSalesBotCommitInput,
  ) {
    if (!input.finance) return null;
    if (!Number.isFinite(input.finance.amount) || input.finance.amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const account = await this.prisma.account.findFirst({
      where: { id: input.finance.accountId, workspaceId, isActive: true },
      select: { id: true, currency: true },
    });
    if (!account) throw new NotFoundException('Finance account not found');
    return account;
  }

  private async managedPost(
    workspaceId: string,
    channelId: string,
    id: string,
  ) {
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: {
        id,
        workspaceId,
        telegramChannelId: channelId,
        status: {
          in: [
            TelegramManagedPostStatus.DRAFT,
            TelegramManagedPostStatus.SCHEDULED,
            TelegramManagedPostStatus.PUBLISHED,
          ],
        },
      },
      select: {
        id: true,
        text: true,
        imageUrls: true,
        buttonRows: true,
        sourceType: true,
      },
    });
    if (!post) throw new NotFoundException('Managed post not found');
    return post;
  }

  private assertContentInput(input: TelegramAdSalesBotCommitInput) {
    if (input.existingManagedPostId && input.post) {
      throw new BadRequestException(
        'Choose captured content or an existing post',
      );
    }
    if (input.deliveryAction === 'SKIP_POST') {
      if (input.post || input.existingManagedPostId) {
        throw new BadRequestException('Skipped delivery cannot include a post');
      }
      return;
    }
    if (!input.post && !input.existingManagedPostId) {
      throw new BadRequestException('Post content is required');
    }
  }

  private scheduledAt(input: TelegramAdSalesBotCommitInput, fallback?: string) {
    const value =
      input.deliveryAction === 'PUBLISH_NOW'
        ? (input.scheduledAt ?? new Date().toISOString())
        : (input.scheduledAt ?? fallback ?? new Date().toISOString());
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid timestamp');
    }
    if (input.deliveryAction === 'SCHEDULE' && date.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
    return date;
  }

  private async result(
    userId: string,
    saleId: string,
    idempotencyKey: string | null,
    deliveryAction: TelegramAdSalesBotCommitInput['deliveryAction'],
    onlyPlacementId?: string,
  ) {
    const sale = (await this.sales.getSale(
      userId,
      saleId,
    )) as TelegramAdSalesBotSale;
    const placements = sale.placements
      .filter((item) => !onlyPlacementId || item.id === onlyPlacementId)
      .map((item) => ({
        placementId: item.id,
        channelId: item.telegramChannelId,
        productId: item.telegramAdProductId,
        managedPostId: item.managedPostId,
        placementStatus: item.status,
      }));
    const first = placements[0];
    if (!first) throw new NotFoundException('Bot command placement not found');
    const payment = idempotencyKey
      ? sale.payments?.find((item) => item.idempotencyKey === idempotencyKey)
      : null;
    return {
      saleId,
      placements,
      placementId: first.placementId,
      managedPostId: first.managedPostId,
      placementStatus: first.placementStatus,
      paymentId: payment?.id ?? null,
      transactionId: payment?.transactionId ?? null,
      saleStatus: sale.status,
      deliveryAction,
    };
  }
}

function inputPost(input: TelegramAdSalesBotCommitInput) {
  if (!input.post) throw new BadRequestException('Post content is required');
  return input.post;
}
