import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import { telegramOperationSignal } from '@api/telegram/shared/mtproto/telegram-operation-signal';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { managedPostSendPayloadHash } from './telegram-managed-post-send-journal.service';
import { productionRecoveryPublicationData } from './telegram-production-recovery-publication';
import type { TelegramOperatorSendDto } from './telegram-operator-send.dto';

function botMessageIds(result: unknown) {
  return (Array.isArray(result) ? result : [result]).map((value) =>
    String((value as { message_id?: number } | null)?.message_id));
}

@Injectable()
export class TelegramOperatorSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly access: TelegramChannelAccessService,
    private readonly bot: TelegramBotApiClient,
    private readonly mtproto: TelegramMtprotoClient,
  ) {}

  async send(userId: string, channelId: string, input: TelegramOperatorSendDto, cancellation: AbortSignal) {
    const { workspaceId } = await this.workspace.requireWorkspaceRole(userId, [WorkspaceRole.owner]);
    const operation = await this.prisma.telegramManagedPostSendOperation.findFirst({
      where: { id: input.operationId, workspaceId, channelId, status: 'STARTED', relayStartedAt: null },
      include: { managedPost: { include: {
        telegramChannel: true,
        adSalePlacements: { select: { id: true, updatedAt: true, status: true, workspaceId: true, telegramChannelId: true } },
      } } },
    });
    const post = operation?.managedPost;
    if (!operation || !post || !operation.relayPostRevision ||
        operation.relayPostRevision.getTime() !== post.updatedAt.getTime() ||
        post.status !== 'PUBLISHING' || post.deliveryClaimOwner !== input.claimOwner ||
        post.workspaceId !== workspaceId || post.telegramChannelId !== channelId ||
        !post.deliveryClaimExpiresAt || post.deliveryClaimExpiresAt <= new Date() ||
        post.origin === 'TELEGRAM' || !post.telegramChannel.isActive ||
        !post.telegramChannel.telegramChatId ||
        post.adSalePlacements.length > 1 ||
        post.adSalePlacements.some((placement) => placement.workspaceId !== workspaceId ||
          placement.telegramChannelId !== channelId || !['DRAFT', 'RESERVED', 'SCHEDULED'].includes(placement.status)) ||
        operation.payloadHash !== managedPostSendPayloadHash(input.payload))
      throw new ConflictException('Operator send identity, claim or content no longer matches');

    const channel = post.telegramChannel;
    const placement = post.adSalePlacements[0];
    const source = await this.prisma.telegramChannelSourceAccess.findFirst({
      where: { workspaceId, channelId, sourceId: operation.sourceId, sourceType: operation.sourceType, canPostMessages: true },
      select: { id: true },
    });
    if (!source) throw new ConflictException('Telegram actor is not enabled for this channel');
    const signal = AbortSignal.any([cancellation, AbortSignal.timeout(
      Math.max(1, Math.min(60_000, post.deliveryClaimExpiresAt.getTime() - Date.now())),
    )]);
    let invoke: () => Promise<unknown>;
    if (input.kind === 'mtproto') {
      if (operation.sourceType !== 'MTPROTO' || input.payload.channelId !== channelId)
        throw new BadRequestException('Invalid MTProto actor or channel');
      const { channelId: _channel, ...payload } = input.payload;
      const rendered = productionRecoveryPublicationData(payload, post.imageUrls, post.mediaItems);
      const account = await this.access.connectedAccount(workspaceId, channelId, operation.sourceId);
      if (!account.mtprotoPublishingEnabled)
        throw new ConflictException('MTProto publication is disabled for this actor');
      invoke = () => this.mtproto.publishPost({
        ...this.access.accountCredentials(account),
        channel: this.access.mtprotoChannelReference(channel),
        ...rendered,
        signal,
      });
    } else {
      if (operation.sourceType !== 'BOT' || input.payload.method !== input.kind)
        throw new BadRequestException('Invalid Bot API actor or method');
      const body = this.botBody(input, post, this.access.botChatId(channel));
      const token = await this.access.botTokenForSource(workspaceId, operation.sourceId);
      const me = await this.bot.getMe(token);
      const membership = await this.bot.getChatMember(token, String(body.chat_id), String(me.id));
      if (membership.status !== 'creator' &&
          (membership.status !== 'administrator' || !membership.can_post_messages))
        throw new ConflictException('The selected bot no longer has permission to post');
      invoke = () => this.bot.call(token, input.kind, body, 'POST', signal);
    }
    signal.throwIfAborted();
    const relayStartedAt = new Date();
    const reserved = await this.prisma.telegramManagedPostSendOperation.updateMany({
      where: {
        id: operation.id, status: 'STARTED', relayStartedAt: null,
        payloadHash: operation.payloadHash, relayPostRevision: post.updatedAt,
        managedPost: { is: {
          id: post.id, workspaceId, telegramChannelId: channelId,
          updatedAt: post.updatedAt, status: 'PUBLISHING', deliveryClaimOwner: input.claimOwner,
          deliveryClaimExpiresAt: { gt: relayStartedAt },
          postBatchDelivery: { is: null }, mutualPromotionDelivery: { is: null },
          adSalePlacements: placement ? {
            some: { id: placement.id, updatedAt: placement.updatedAt, status: placement.status },
            every: { id: placement.id },
          } : { none: {} },
        } },
      },
      data: { relayStartedAt },
    });
    if (reserved.count !== 1) throw new ConflictException('Operator transport already started or claim changed');
    try {
      signal.throwIfAborted();
      const result = await invoke();
      const ids = input.kind === 'mtproto' ? result as string[] : botMessageIds(result);
      if (!ids.length || ids.some((id) => !/^[1-9][0-9]*$/.test(id)))
        throw new Error('Telegram did not return message IDs');
      const saved = await this.prisma.telegramManagedPostSendOperation.updateMany({
        where: { id: operation.id, relayStartedAt, status: { in: ['STARTED', 'UNKNOWN'] } },
        data: { status: 'ACKED', messageIds: ids, confirmedAt: new Date() },
      });
      if (saved.count !== 1) throw new Error('Telegram send receipt could not be saved');
      if (input.kind === 'mtproto') return ids;
      const messages = ids.map((id) => ({ message_id: Number(id) }));
      return input.kind === 'sendMediaGroup' ? messages : messages[0];
    } catch {
      await this.prisma.telegramManagedPostSendOperation.updateMany({
        where: { id: operation.id, relayStartedAt, status: 'STARTED' },
        data: { status: 'UNKNOWN' },
      }).catch(() => undefined);
      throw new ConflictException('Telegram outcome is uncertain. Check the send receipt before retrying.');
    }
  }

  async verifyExisting(userId: string, channelId: string, postId: string, cancellation: AbortSignal) {
    const { workspaceId } = await this.workspace.requireWorkspaceRole(userId, [WorkspaceRole.owner]);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: {
        id: postId, workspaceId, telegramChannelId: channelId, status: 'PUBLISHED',
        telegramIdVerificationStatus: 'VERIFIED', origin: 'SYSTEM',
        adSalePlacements: { some: { workspaceId, telegramChannelId: channelId } },
      },
      include: { telegramChannel: true },
    });
    if (!post?.telegramChannel.telegramChatId || !post.telegramChannel.isActive ||
        !post.telegramMessageIds.length || post.telegramMessageIds.length > 100 ||
        post.telegramMessageIds.some((id) => !/^[1-9][0-9]*$/.test(id))) return false;
    const account = await this.access.verifiedSyncAccount(workspaceId, post.telegramChannel, 'POSTS');
    cancellation.throwIfAborted();
    const result = await telegramOperationSignal.run(cancellation, () => this.mtproto.getManagedPostMessages({
      ...this.access.accountCredentials(account),
      channel: this.access.mtprotoChannelReference(post.telegramChannel),
      publishedMessageIds: post.telegramMessageIds,
      scheduledMessageIds: [],
    }));
    const found = new Set(result.published.map(({ id }) => id));
    return post.telegramMessageIds.every((id) => found.has(id));
  }

  private botBody(
    input: TelegramOperatorSendDto,
    post: { imageUrls: string[]; mediaItems: unknown },
    chatId: string | null,
  ) {
    const body = input.payload.body as Record<string, unknown> | undefined;
    const fields: Record<string, string[]> = {
      sendMessage: ['text', 'entities', 'reply_markup'],
      sendRichMessage: ['rich_message', 'reply_markup'],
      sendPhoto: ['photo', 'caption', 'caption_entities', 'reply_markup'],
      sendVideo: ['video', 'caption', 'caption_entities', 'reply_markup'],
      sendMediaGroup: ['media'],
    };
    if (!body || !chatId || body.chat_id !== chatId ||
        Object.keys(body).some((key) => key !== 'chat_id' && !fields[input.kind]?.includes(key)))
      throw new BadRequestException('Invalid operator Bot API payload');
    const media = normalizeTelegramPostMediaItems(post.mediaItems, post.imageUrls);
    const urls = new Set(media.map((item) => item.url));
    const references = input.kind === 'sendPhoto' ? [body.photo] : input.kind === 'sendVideo' ? [body.video] :
      input.kind === 'sendMediaGroup' && Array.isArray(body.media)
        ? body.media.map((item) => item?.media) : [];
    if (references.some((url) => typeof url !== 'string' || !urls.has(url)))
      throw new BadRequestException('Operator Bot API media must match the stored post');
    return body;
  }
}
