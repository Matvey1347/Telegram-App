import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { telegramOperationSignal } from '@api/telegram/shared/mtproto/telegram-operation-signal';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import {
  assertExistingNativeScheduleIdentity,
  ordinaryScheduledPostWhere,
} from './telegram-managed-post-rescheduler-repair';
import {
  TelegramManagedPostNativeRecoveryStore,
  type NativeRecoveryIdentity,
} from './telegram-managed-post-native-recovery.store';
import {
  assertRescheduleActive,
  rescheduleContext,
} from './telegram-managed-post-rescheduler.remote';
import { TelegramProductionRecoveryTransportDto } from './telegram-production-recovery-transport.dto';

import {
  productionRecoveryPublicationData,
  RecoveryRequestError,
} from './telegram-production-recovery-publication';

class RecoveryConflictError extends ConflictException {}

@Injectable()
export class TelegramProductionRecoveryTransportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TelegramChannelsSupportService,
    private readonly access: TelegramChannelAccessService,
    private readonly mtproto: TelegramMtprotoClient,
    private readonly nativeStore: TelegramManagedPostNativeRecoveryStore,
  ) {}

  async execute(
    userId: string,
    channelId: string,
    input: TelegramProductionRecoveryTransportDto,
    cancellation: AbortSignal,
  ) {
    this.validateEnvelope(input);
    if (input.operation === 'delete')
      throw new RecoveryRequestError('Standalone deletion is disabled. Use the acknowledged native replacement flow.');
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      select: {
        id: true,
        username: true,
        telegramChatId: true,
        inviteLink: true,
        telegramAccessHash: true,
      },
    });
    if (!channel) throw new NotFoundException('Recovery channel not found');
    const [admin, source] = await Promise.all([
      this.prisma.telegramChannelAdminLink.findFirst({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          telegramUserAccountIntegrationId: input.accountId,
        },
        select: { id: true },
      }),
      this.prisma.telegramChannelSourceAccess.findFirst({
        where: {
          workspaceId,
          channelId,
          sourceId: input.accountId,
          sourceType: 'MTPROTO',
        },
        select: { canPostMessages: true, canDeleteMessages: true },
      }),
    ]);
    if (!admin && !source)
      throw new NotFoundException(
        'Recovery account is not linked to this channel',
      );
    let signal = AbortSignal.any([cancellation, AbortSignal.timeout(60_000)]);
    let nativeAttempt: NativeRecoveryIdentity | undefined;
    try {
      signal.throwIfAborted();
      const account = await this.access.connectedAccount(
        workspaceId,
        channelId,
        input.accountId,
      );
      const mutation = ['publish', 'replace'].includes(
        input.operation,
      );
      if (
        mutation &&
        (!account.mtprotoPublishingEnabled ||
          (!admin && !source?.canPostMessages))
      )
        throw new RecoveryConflictError(
          'Recovery account is not enabled for publication',
        );
      if (
        input.operation === 'replace' &&
        (!source?.canPostMessages || !source.canDeleteMessages)
      )
        throw new RecoveryConflictError(
          'Recovery replacement requires publishing and deletion permission',
        );
      const credentials = this.access.accountCredentials(account);
      const channelReference = this.access.mtprotoChannelReference(channel);
      return await telegramOperationSignal.run(signal, async () => {
        switch (input.operation) {
          case 'scheduled':
            return this.mtproto.getScheduledHistory({
              ...credentials,
              channel: channelReference,
            });
          case 'profile':
            return this.mtproto.getAccountProfile(credentials);
          case 'history': {
            const from = new Date(input.historyFrom ?? '');
            const until = new Date(input.historyUntil ?? '');
            if (
              !Number.isFinite(from.getTime()) ||
              !Number.isFinite(until.getTime()) ||
              from > until ||
              until.getTime() - from.getTime() > 370 * 86400_000 ||
              until.getTime() > Date.now() + 300_000
            )
              throw new RecoveryRequestError(
                'Recovery history requires a bounded valid window',
              );
            return this.mtproto.getManagedPostMessages({
              ...credentials,
              channel: channelReference,
              publishedMessageIds: [],
              scheduledMessageIds: [],
              recentPublishedFrom: from,
              recentPublishedUntil: until,
            });
          }
          case 'replace':
          case 'publish': {
            const post = await this.claimedPost(workspaceId, channelId, input);
            const scheduledAt = post.scheduledAt!;
            const remaining =
              post.deliveryClaimExpiresAt!.getTime() - Date.now();
            if (remaining <= 0)
              throw new RecoveryConflictError(
                'Recovery claim expired before transport started',
              );
            signal = AbortSignal.any([
              signal,
              AbortSignal.timeout(Math.min(60_000, remaining)),
            ]);
            return telegramOperationSignal.run(signal, () =>
              rescheduleContext.run(
                {
                  owner: input.claimOwner!,
                  signal,
                  ...(scheduledAt > new Date() ? { scheduledAt } : {}),
                },
                async () => {
                  await assertRescheduleActive(this.prisma, post.id);
                  if (scheduledAt <= new Date())
                    throw new RecoveryConflictError(
                      'Recovery publication deadline elapsed',
                    );
                  const data = productionRecoveryPublicationData(
                    input.data,
                    post.imageUrls,
                    post.mediaItems,
                  );
                  signal.throwIfAborted();
                  await assertRescheduleActive(this.prisma, post.id);
                  const identity = {
                    owner: input.claimOwner!,
                    postId: post.id,
                    workspaceId,
                    channelId,
                  };
                  const prepared = await this.nativeStore.read(
                    post.id,
                    workspaceId,
                    channelId,
                  );
                  if (
                    !prepared ||
                    prepared.owner !== input.claimOwner ||
                    prepared.sourceId !== input.accountId ||
                    prepared.scheduledAt.getTime() !== scheduledAt.getTime() ||
                    prepared.oldMessageIds.length !==
                      post.telegramScheduledMessageIds.length ||
                    prepared.oldMessageIds.some(
                      (id, index) =>
                        id !== post.telegramScheduledMessageIds[index],
                    )
                  )
                    throw new RecoveryConflictError(
                      'Recovery preparation does not match the selected account and stored schedule',
                    );
                  if (input.operation === 'replace') {
                    const ids = input.messageIds;
                    if (
                      input.accountId !== post.sourceId ||
                      !ids?.length ||
                      new Set(ids).size !== ids.length ||
                      ids.length !== post.telegramScheduledMessageIds.length ||
                      ids.some(
                        (id) => !post.telegramScheduledMessageIds.includes(id),
                      )
                    )
                      throw new RecoveryConflictError(
                        'Recovery replacement requires all exact stored scheduled IDs',
                      );
                    const foreign =
                      await this.prisma.telegramManagedPost.findFirst({
                        where: {
                          workspaceId,
                          telegramChannelId: channelId,
                          id: { not: post.id },
                          status: { in: ['SCHEDULED', 'PUBLISHING'] },
                          telegramScheduledMessageIds: { hasSome: ids },
                        },
                        select: { id: true },
                      });
                    if (foreign)
                      throw new RecoveryConflictError(
                        'Recovery scheduled IDs overlap another managed post',
                      );
                  }
                  nativeAttempt = identity;
                  const ids = await this.mtproto.publishPost({
                    ...credentials,
                    channel: channelReference,
                    ...data,
                    scheduleAt: scheduledAt,
                    signal,
                    ...(input.operation === 'replace'
                      ? {
                          replacement: {
                            messageIds: input.messageIds!,
                            previousScheduledAt: scheduledAt,
                            requireCancellationAcknowledgement: true,
                            validate: (remote) => {
                              const scheduledIds = new Set(
                                remote.map((message) => message.id),
                              );
                              if (
                                !input.messageIds!.every((id) =>
                                  scheduledIds.has(id),
                                )
                              )
                                throw new RecoveryConflictError(
                                  'Recovery replacement requires every stored schedule to remain present',
                                );
                              if (remote.some(({ date }) => !date ||
                                  Math.floor(new Date(date).getTime() / 1000) !== Math.floor(scheduledAt.getTime() / 1000)))
                                throw new RecoveryConflictError('Recovery replacement requires the original scheduled time');
                              assertExistingNativeScheduleIdentity(post, {
                                scheduledMessages: remote,
                                scheduledIds,
                              });
                            },
                            beforeChange: async () => {
                              await assertRescheduleActive(
                                this.prisma,
                                post.id,
                              );
                              await this.nativeStore.start(identity);
                              nativeAttempt = identity;
                            },
                            afterCancel: () =>
                              this.nativeStore.cancelled(identity),
                          },
                        }
                      : {
                          beforeSend: async () => {
                            await this.nativeStore.start(identity);
                          },
                        }),
                  });
                  await this.nativeStore.acknowledged({
                    ...identity,
                    newMessageIds: ids,
                  });
                  return ids;
                },
              ),
            );
          }
        }
      });
    } catch (error) {
      if (nativeAttempt) {
        try {
          await this.nativeStore.failed(nativeAttempt);
        } catch {
          /* Keep original uncertainty; never release the claim. */
        }
      }
      if (
        error instanceof RecoveryRequestError ||
        error instanceof RecoveryConflictError
      )
        throw error;
      // Remote errors can include session keys, media URLs or invite hashes.
      // Preserve only fixed classifications, never arbitrary provider messages.
      const message = error instanceof Error ? error.message : '';
      const classification =
        /\b(FLOOD_WAIT_\d+|AUTH_KEY_UNREGISTERED|AUTH_KEY_DUPLICATED|SESSION_REVOKED|CHAT_ADMIN_REQUIRED|CHAT_WRITE_FORBIDDEN|CHANNEL_PRIVATE)\b/.exec(
          message,
        )?.[1];
      throw new RecoveryConflictError(
        classification
          ? `Telegram recovery transport rejected: ${classification}`
          : signal.aborted
            ? 'Telegram recovery transport cancelled or timed out; reconcile before retrying'
            : 'Telegram recovery transport failed; reconcile before retrying',
      );
    }
  }

  private validateEnvelope(input: TelegramProductionRecoveryTransportDto) {
    const keys = new Set([
      'operation',
      'accountId',
      'postId',
      'claimOwner',
      'scheduleAt',
      'historyFrom',
      'historyUntil',
      'messageIds',
      'data',
    ]);
    if (
      !input ||
      Object.keys(input).some((key) => !keys.has(key)) ||
      ![
        'scheduled',
        'history',
        'delete',
        'publish',
        'replace',
        'profile',
      ].includes(input.operation) ||
      typeof input.accountId !== 'string' ||
      !input.accountId ||
      input.accountId.length > 64
    )
      throw new RecoveryRequestError('Invalid recovery transport request');
    if (
      ['delete', 'publish', 'replace'].includes(input.operation) &&
      (!input.postId || !input.claimOwner || !input.scheduleAt)
    )
      throw new RecoveryRequestError(
        'Recovery mutations require post, live claim and stored schedule',
      );
  }

  private async claimedPost(
    workspaceId: string,
    channelId: string,
    input: TelegramProductionRecoveryTransportDto,
  ) {
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: {
        ...ordinaryScheduledPostWhere(workspaceId, channelId),
        id: input.postId,
        deliveryClaimOwner: input.claimOwner,
        deliveryClaimExpiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        scheduledAt: true,
        deliveryClaimExpiresAt: true,
        sourceId: true,
        sourceType: true,
        status: true,
        scheduleMode: true,
        text: true,
        publishMode: true,
        imageUrls: true,
        mediaItems: true,
        telegramScheduledMessageIds: true,
      },
    });
    if (
      !post?.scheduledAt ||
      !post.deliveryClaimExpiresAt ||
      post.scheduledAt.getTime() !== new Date(input.scheduleAt!).getTime()
    )
      throw new RecoveryConflictError(
        'Recovery post or live claim changed; refresh before retrying',
      );
    return post;
  }
}
