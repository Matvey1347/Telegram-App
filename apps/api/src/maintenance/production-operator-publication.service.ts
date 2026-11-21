import { ConflictException, ForbiddenException, Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma, TelegramManagedPost } from '@prisma/client';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { PrismaService } from '../prisma/prisma.service';
import { productionRecoveryConfig } from '../config/production-recovery-config';
import { recoveryAuthorization, productionOperatorRequest } from '../telegram/shared/mtproto/production-recovery-relay-context';
import { managedPostDeliveryContext } from '../domains/telegram/telegram-channels/telegram-managed-post-delivery-context';
import { TelegramManagedPostPublicationService } from '../domains/telegram/telegram-channels/telegram-managed-post-publication.service';
import type { PublishTelegramManagedPostDto } from '../domains/telegram/telegram-channels/dto';
import { loadAdPublicationPlacement, publishAdPlacement, reconcileAdPlacement } from '../domains/telegram/telegram-ad-sales/telegram-ad-single-placement-publication';

export function requireOperatorRevision(expected: string | undefined, actual: string) {
  if (actual !== expected) throw new PreconditionFailedException('This object changed. Reload it and confirm the current revision.');
}

@Injectable()
export class ProductionOperatorPublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publication: TelegramManagedPostPublicationService,
  ) {}

  private postScope(postId: string, placementId?: string): Prisma.TelegramManagedPostWhereInput {
    const { workspaceId, channelId } = productionRecoveryConfig();
    return {
      id: postId, workspaceId, telegramChannelId: channelId, origin: 'SYSTEM',
      remoteImportKey: null, postBatchDelivery: { is: null }, mutualPromotionDelivery: { is: null },
      adSalePlacements: placementId ? { some: { id: placementId, workspaceId, telegramChannelId: channelId }, every: { id: placementId } } : { none: {} },
    };
  }

  async selectedPlacementForPost(postId: string) {
    const { workspaceId, channelId, saleId, placementId } = productionRecoveryConfig();
    if (!saleId || !placementId) return undefined;
    const selected = await this.prisma.telegramAdSalePlacement.findFirst({
      where: { id: placementId, workspaceId, telegramAdSaleId: saleId, telegramChannelId: channelId, managedPostId: postId },
      select: { id: true },
    });
    return selected?.id;
  }

  async postRevision(postId: string) {
    const placementId = await this.selectedPlacementForPost(postId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: this.postScope(postId, placementId),
      select: { updatedAt: true, title: true },
    });
    if (!post) throw new NotFoundException('Ordinary post not found in the selected channel');
    return { revision: post.updatedAt.toISOString(), title: post.title };
  }

  async publishPost(userId: string, postId: string, expected: string | undefined, dto: PublishTelegramManagedPostDto, signal: AbortSignal, reconcile = false) {
    const scope = this.postScope(postId);
    const post = await this.prisma.telegramManagedPost.findFirst({ where: scope });
    if (!post) throw new NotFoundException('Ordinary post not found in the selected channel');
    requireOperatorRevision(expected, post.updatedAt.toISOString());
    if (reconcile) return this.projectAcknowledged(userId, post, scope, dto, signal);
    return this.publishClaimed(userId, post, scope, dto, signal);
  }

  private async placement(saleId: string, placementId: string) {
    const config = productionRecoveryConfig();
    if (config.saleId !== saleId || config.placementId !== placementId)
      throw new ForbiddenException('Select the configured Ad Sales deal and placement');
    const placement = await loadAdPublicationPlacement(this.prisma, config.workspaceId, saleId, placementId);
    if (placement.telegramChannelId !== config.channelId || !placement.managedPost)
      throw new NotFoundException('Placement has no managed post in the selected channel');
    return { placement, post: placement.managedPost };
  }

  async placementRevision(saleId: string, placementId: string) {
    const { placement, post } = await this.placement(saleId, placementId);
    return { revision: this.placementVersion(placement.updatedAt, post), title: post.title };
  }

  private placementVersion(updatedAt: Date, post: TelegramManagedPost) {
    return `${updatedAt.toISOString()}/${post.updatedAt.toISOString()}`;
  }

  async publishPlacement(
    userId: string, saleId: string, placementId: string, expected: string | undefined,
    dto: PublishTelegramManagedPostDto, signal: AbortSignal, reconcile: boolean,
  ) {
    const { placement, post } = await this.placement(saleId, placementId);
    requireOperatorRevision(expected, this.placementVersion(placement.updatedAt, post));
    const scope = this.postScope(post.id, placementId);
    if (reconcile || post.status === 'PUBLISHED') {
      if (!await this.prisma.telegramManagedPost.count({ where: scope }))
        throw new ConflictException('Placement no longer owns this publication');
      const resolved = post.status === 'PUBLISHED' ? post :
        await this.projectAcknowledged(userId, post, scope, dto, signal, placementId);
      await this.verifyExistingPublication(post.id, signal);
      await reconcileAdPlacement(this.prisma, { ...placement, managedPost: resolved });
      return { id: placementId, status: 'PUBLISHED' as const };
    }
    if (!['DRAFT', 'RESERVED', 'SCHEDULED'].includes(placement.status))
      throw new ConflictException('Placement status does not permit publication');
    return publishAdPlacement(this.prisma, placement, () => this.publishClaimed(userId, post, {
      ...scope, adSalePlacements: {
        some: { id: placementId, updatedAt: placement.updatedAt, status: placement.status },
        every: { id: placementId },
      },
    }, dto, signal, placementId));
  }

  private async publishClaimed(
    userId: string, post: TelegramManagedPost, scope: Prisma.TelegramManagedPostWhereInput,
    dto: PublishTelegramManagedPostDto, cancellation: AbortSignal, placementId?: string,
  ) {
    const media = normalizeTelegramPostMediaItems(post.mediaItems, post.imageUrls);
    const hasButtons = Array.isArray(post.buttonRows) && post.buttonRows.length > 0;
    if (media.some((item) => item.kind === 'ANIMATION') || media.length > 10 || (hasButtons && media.length > 1))
      throw new ConflictException('Operator supports text, photo or video posts, and albums without buttons');
    if (!post.text?.trim() && !media.length) throw new ConflictException('Post has no publishable content');
    if (post.status !== 'DRAFT' && (post.status !== 'SCHEDULED' || post.scheduleMode !== 'LOCAL'))
      throw new ConflictException('Operator publish accepts an unpublished draft or local schedule. Reconcile delivery evidence first.');

    cancellation.throwIfAborted();
    const owner = `operator:${randomUUID()}`;
    const held = await this.prisma.telegramManagedPost.updateMany({
      where: {
        ...scope, updatedAt: post.updatedAt, status: post.status, deliveryClaimOwner: null,
        telegramMessageIds: { isEmpty: true }, telegramScheduledMessageIds: { isEmpty: true },
        publishedAt: null, telegramPostId: null, sendOperations: { none: {} }, nativeRecovery: { is: null },
      },
      // Keep an interrupted operator mutation fenced even against an older
      // worker. The request and cloud transport have independent short deadlines.
      data: this.operatorClaim(owner),
    });
    if (held.count !== 1) throw new ConflictException('This revision changed, has delivery evidence, or is already claimed');

    return this.runClaimed(userId, post, owner, dto, cancellation, placementId);
  }

  private operatorClaim(owner: string) {
    return {
      status: 'PUBLISHING' as const, deliveryClaimOwner: owner,
      deliveryClaimExpiresAt: new Date('9999-12-31T00:00:00.000Z'),
      deliveryNextAttemptAt: new Date(Date.now() + 90_000),
    };
  }

  private async projectAcknowledged(
    userId: string, post: TelegramManagedPost, scope: Prisma.TelegramManagedPostWhereInput,
    dto: PublishTelegramManagedPostDto, signal: AbortSignal, placementId?: string,
  ) {
    const receipts = await this.prisma.telegramManagedPostSendOperation.findMany({
      where: { postId: post.id, workspaceId: post.workspaceId, channelId: post.telegramChannelId },
      select: { sourceId: true, sourceType: true, status: true, relayStartedAt: true, ordinal: true },
    });
    const first = receipts[0];
    if (!post.deliveryClaimOwner?.startsWith('operator:') || !first ||
        receipts.some((item) => item.status !== 'ACKED' || !item.relayStartedAt ||
          item.sourceId !== first.sourceId || item.sourceType !== first.sourceType)) {
      throw new ConflictException('A complete acknowledged delivery is required. Unknown or partial sends must be reconciled with Telegram evidence.');
    }
    signal.throwIfAborted();
    const owner = `operator:${randomUUID()}`;
    const held = await this.prisma.telegramManagedPost.updateMany({
      where: {
        ...scope, updatedAt: post.updatedAt, deliveryClaimOwner: post.deliveryClaimOwner,
        deliveryNextAttemptAt: { lte: new Date() }, status: { in: ['PUBLISHING', 'FAILED'] },
        sendOperations: { every: { status: 'ACKED', sourceId: first.sourceId, sourceType: first.sourceType } },
      },
      data: this.operatorClaim(owner),
    });
    if (held.count !== 1) throw new ConflictException('Publication is still active or its revision changed');
    return this.runClaimed(userId, post, owner, dto, signal, placementId, {
      id: first.sourceId, type: first.sourceType, ordinals: new Set(receipts.map(({ ordinal }) => ordinal)),
    });
  }

  private async runClaimed(
    userId: string, post: TelegramManagedPost, owner: string, dto: PublishTelegramManagedPostDto,
    cancellation: AbortSignal, placementId?: string, acknowledgedActor?: { id: string; type: string; ordinals: Set<number> },
  ) {
    const signal = AbortSignal.any([cancellation, AbortSignal.timeout(75_000)]);
    try {
      return await productionOperatorRequest.run({ signal, postId: post.id, placementId, acknowledgedActor, remainingAckOrdinals: acknowledgedActor?.ordinals }, () =>
        managedPostDeliveryContext.run({ postId: post.id, owner, signal }, () =>
          this.publication.publishManagedPostNow(userId, post.telegramChannelId, post.id, dto),
        ));
    } finally {
      const where = { id: post.id, workspaceId: post.workspaceId, deliveryClaimOwner: owner };
      await this.prisma.telegramManagedPost.updateMany({
        where: { ...where, status: 'PUBLISHED' },
        data: { deliveryClaimOwner: null, deliveryClaimExpiresAt: null, deliveryNextAttemptAt: null },
      }).catch(() => undefined);
      await this.prisma.telegramManagedPost.updateMany({
        where: { ...where, status: { in: ['PUBLISHING', 'FAILED'] }, sendOperations: { none: {} } },
        data: { status: post.status, deliveryClaimOwner: null, deliveryClaimExpiresAt: null, deliveryNextAttemptAt: null },
      }).catch(() => undefined);
      await this.prisma.telegramManagedPost.updateMany({
        where: { ...where, sendOperations: { some: {} } },
        data: { deliveryNextAttemptAt: new Date() },
      }).catch(() => undefined);
    }
  }

  private async verifyExistingPublication(postId: string, cancellation: AbortSignal) {
    const config = productionRecoveryConfig();
    const response = await fetch(
      `${config.productionApiOrigin}/telegram-channels/${config.channelId}/operator-publication-evidence/${postId}`,
      {
        redirect: 'error',
        headers: { authorization: recoveryAuthorization.getStore() ?? '', 'x-workspace-id': config.workspaceId, 'x-bypass-response-cache': '1' },
        signal: AbortSignal.any([cancellation, AbortSignal.timeout(30_000)]),
      },
    );
    if (!response.ok || (await response.json()).verified !== true)
      throw new ConflictException('The current Railway runtime could not verify the existing publication');
  }
}
