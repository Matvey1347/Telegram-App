import { createHash } from 'crypto';
import {
  channelAvatarEmojiManagedChannelWhere,
  channelAvatarEmojiAdminAccessWhere,
} from './channel-avatar-emoji-ownership';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { ChannelAvatarEmojiPublisherService } from './channel-avatar-emoji-publisher.service';
import { ChannelAvatarPhotoService } from '@api/telegram/shared/emoji/channel-avatar-photo.service';
import {
  ChannelAvatarEmojiApi,
  AvatarEmojiApiError,
} from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import { telegramAccountCredentials } from '@api/telegram/shared/mtproto/telegram-account-credentials';
import { renderTelegramCustomEmojiToken } from '@api/telegram/shared/markup/telegram-custom-emoji-markup';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import {
  channelAvatarEmojiImage,
  storedChannelAvatarBytes,
} from './channel-avatar-emoji-image';

export type ChannelAvatarEmojiProcessOptions = {
  scheduleRetry?: boolean;
  /** Atomically claim terminal/due work for one-shot execution without a worker-visible enqueue. */
  admit?: boolean;
  /** Trusted maintenance-only immutable bytes; never accepted from HTTP DTOs. */
  preparedImage?: { hash: string; png: Buffer; imageUrl: string };
};

export type ChannelAvatarEmojiProcessOutcome = {
  status: 'READY' | 'NO_AVATAR' | 'ERROR' | 'BUSY' | 'NOT_OWNED';
  customEmojiId?: string;
  createdDocument?: boolean;
  packId?: number;
};

/** Singleton processing shared by due-driven runtime and one-shot maintenance. */
@Injectable()
export class ChannelAvatarEmojiProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly photos: ChannelAvatarPhotoService,
    private readonly publisher: ChannelAvatarEmojiPublisherService,
    private readonly api: ChannelAvatarEmojiApi,
  ) {}

  /** Event-only initial admission; repeated dialog sync cannot restart ready/error work. */
  async enqueueInitial(workspaceId: string, id: string) {
    const configured = this.api.configured();
    const admitted = await this.prisma.telegramChannel.updateMany({
      where: {
        id,
        ...channelAvatarEmojiManagedChannelWhere(workspaceId),
        avatarEmojiIconId: null,
        avatarEmojiRetryAt: null,
        avatarEmojiStatus: 'PENDING',
      },
      data: {
        avatarEmojiError: configured
          ? null
          : 'Channel avatar emoji service is not configured.',
        avatarEmojiStatus: configured ? 'PENDING' : 'ERROR',
        avatarEmojiRetryAt: configured ? new Date() : null,
      },
    });
    if (admitted.count)
      notifyScheduledTaskDueWorkChanged('channel-avatar-emoji');
  }

  async enqueue(workspaceId: string, id: string, wake = true) {
    const owned = await this.prisma.telegramChannel.findFirst({
      where: { id, ...channelAvatarEmojiManagedChannelWhere(workspaceId) },
      select: { id: true },
    });
    if (!owned) return;
    const configured = this.api.configured();
    await this.prisma.telegramChannel.updateMany({
      where: {
        id,
        ...channelAvatarEmojiManagedChannelWhere(workspaceId),
        OR: [
          { avatarEmojiStatus: { not: 'PENDING' } },
          { avatarEmojiRetryAt: null },
          { avatarEmojiRetryAt: { lte: new Date() } },
        ],
      },
      data: {
        avatarEmojiStatus: configured ? 'PENDING' : 'ERROR',
        avatarEmojiError: configured
          ? null
          : 'Channel avatar emoji service is not configured.',
        avatarEmojiAttempts: 0,
        avatarEmojiRetryAt: configured ? new Date() : null,
      },
    });
    if (wake) notifyScheduledTaskDueWorkChanged('channel-avatar-emoji');
  }

  /** Internal due-driven job: no request/user context and no cross-workspace fallback. */
  async process(
    workspaceId: string,
    id: string,
    options: ChannelAvatarEmojiProcessOptions = {},
  ): Promise<ChannelAvatarEmojiProcessOutcome> {
    const ownerWhere = channelAvatarEmojiManagedChannelWhere(workspaceId);
    const owned = await this.prisma.telegramChannel.findFirst({
      where: { id, ...ownerWhere },
      select: {
        id: true,
        sourceAccesses: {
          where: channelAvatarEmojiAdminAccessWhere(workspaceId),
          select: { sourceId: true },
        },
      },
    });
    if (!owned) return { status: 'NOT_OWNED' };
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 600_000);
    const claimedWhere = { id, ...ownerWhere, avatarEmojiRetryAt: leaseUntil };
    // One channel claim. Crash recovery is due after the maximum bounded attempt.
    const claim = await this.prisma.telegramChannel.updateMany({
      where: {
        id,
        ...ownerWhere,
        ...(options.admit
          ? {
              OR: [
                { avatarEmojiRetryAt: null },
                { avatarEmojiRetryAt: { lte: now } },
              ],
            }
          : { avatarEmojiRetryAt: { lte: now } }),
      },
      data: {
        avatarEmojiStatus: 'PENDING',
        avatarEmojiAttempts: { increment: 1 },
        avatarEmojiRetryAt: leaseUntil,
      },
    });
    if (!claim.count) return { status: 'BUSY' };
    try {
      if (!this.api.configured())
        throw new AvatarEmojiApiError(
          'Channel avatar emoji service is not configured.',
        );
      const channel = await this.prisma.telegramChannel.findFirstOrThrow({
        where: { id, workspaceId },
      });
      let image = options.preparedImage;
      if (
        image &&
        createHash('sha256').update(image.png).digest('hex') !== image.hash
      ) {
        throw new Error('Prepared avatar content hash does not match');
      }
      if (!image) {
        const account =
          await this.prisma.telegramUserAccountIntegration.findFirst({
            where: {
              workspaceId,
              id: { in: owned.sourceAccesses.map((source) => source.sourceId) },
              isActive: true,
              status: 'connected',
              sessionEncrypted: { not: null },
              sessionIv: { not: null },
              sessionAuthTag: { not: null },
            },
            orderBy: { updatedAt: 'desc' },
          });
        let bytes: Buffer | null;
        if (account) {
          try {
            bytes = await this.photos.download(
              telegramAccountCredentials(this.encryption, account),
              channel,
            );
          } catch (error) {
            bytes = storedChannelAvatarBytes(channel.photoUrl);
            if (!bytes) throw error;
          }
        } else {
          bytes = storedChannelAvatarBytes(channel.photoUrl);
          if (!bytes)
            throw new Error(
              'No connected Telegram administrator or stored avatar',
            );
        }
        if (!bytes) {
          const completed = await this.prisma.$transaction(async (tx) => {
            await tx.telegramChannel.updateMany({
              where: { ...claimedWhere, avatarEmojiManual: false },
              data: { presentationIconId: null },
            });
            return tx.telegramChannel.updateMany({
              where: claimedWhere,
              data: {
                avatarEmojiIconId: null,
                avatarEmojiHash: null,
                avatarEmojiStatus: 'NO_AVATAR',
                avatarEmojiError: null,
                avatarEmojiRetryAt: null,
              },
            });
          });
          return {
            status: completed.count ? 'NO_AVATAR' : 'BUSY',
            createdDocument: false,
          };
        }
        image = await channelAvatarEmojiImage(bytes);
      }
      const expectedIconName = `channel-avatar:${this.api.assetKey(image.hash)}`;
      const currentIcon = channel.avatarEmojiIconId
        ? await this.prisma.icon.findFirst({
            where: {
              id: channel.avatarEmojiIconId,
              workspaceId,
              type: 'emoji',
              name: expectedIconName,
            },
            select: { id: true },
          })
        : null;
      if (image.hash === channel.avatarEmojiHash && currentIcon) {
        const completed = await this.prisma.telegramChannel.updateMany({
          where: claimedWhere,
          data: {
            avatarEmojiStatus: 'READY',
            avatarEmojiError: null,
            avatarEmojiRetryAt: null,
          },
        });
        return {
          status: completed.count ? 'READY' : 'BUSY',
          createdDocument: false,
        };
      }
      // Ownership may have changed while Telegram returned the photo.
      const stillOwned = await this.prisma.telegramChannel.findFirst({
        where: { id, ...ownerWhere },
        select: { id: true },
      });
      if (!stillOwned) return { status: 'NOT_OWNED' };
      const asset = await this.publisher.publish(image);
      const completed = await this.prisma.$transaction(async (tx) => {
        // Workspace-owned Icon prevents system assets from becoming cross-tenant selectors.
        const icon = await tx.icon.upsert({
          where: {
            workspaceId_type_name: {
              workspaceId,
              type: 'emoji',
              name: `channel-avatar:${asset.hash}`,
            },
          },
          create: {
            workspaceId,
            type: 'emoji',
            name: `channel-avatar:${asset.hash}`,
            emoji: renderTelegramCustomEmojiToken('📢', asset.customEmojiId!),
            imageUrl: image.imageUrl,
          },
          update: {},
        });
        // Recheck mode in the write, so a concurrent manual choice always wins.
        await tx.telegramChannel.updateMany({
          where: { ...claimedWhere, avatarEmojiManual: false },
          data: { presentationIconId: icon.id },
        });
        return tx.telegramChannel.updateMany({
          where: claimedWhere,
          data: {
            avatarEmojiIconId: icon.id,
            avatarEmojiHash: image.hash,
            avatarEmojiStatus: 'READY',
            avatarEmojiError: null,
            avatarEmojiRetryAt: null,
          },
        });
      });
      return {
        status: completed.count ? 'READY' : 'BUSY',
        customEmojiId: asset.customEmojiId ?? undefined,
        createdDocument: asset.createdDocument,
        packId: asset.packId ?? undefined,
      };
    } catch (error) {
      const current = await this.prisma.telegramChannel.findFirst({
        where: { id, workspaceId },
        select: { avatarEmojiAttempts: true },
      });
      if (!current) return { status: 'BUSY' };
      const permanent =
        error instanceof AvatarEmojiApiError &&
        ((error.explicitRejected && error.errorCode === 400) ||
          !this.api.configured());
      const delay = Math.max(
        30,
        error instanceof AvatarEmojiApiError
          ? (error.retryAfterSeconds ?? 60)
          : 60,
      );
      const completed = await this.prisma.telegramChannel.updateMany({
        where: claimedWhere,
        data: {
          avatarEmojiStatus: 'ERROR',
          avatarEmojiError:
            error instanceof AvatarEmojiApiError
              ? error.message
              : 'Could not refresh the Telegram avatar. Retry when the account is available.',
          avatarEmojiRetryAt:
            options.scheduleRetry !== false &&
            !permanent &&
            current.avatarEmojiAttempts < 5
              ? new Date(Date.now() + delay * 1000)
              : null,
        },
      });
      return { status: completed.count ? 'ERROR' : 'BUSY' };
    }
  }
}
