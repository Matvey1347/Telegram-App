import { runBounded } from '@api/common/run-bounded';
import { NotFoundException } from '@nestjs/common';
import { TelegramSourceType, TelegramUserAccountStatus } from '@prisma/client';
import { normalizeTelegramChannelId } from '@api/telegram/shared/imports/telegram-post-url';
import type { TelegramSourceAccessService } from '@api/telegram/shared/imports/telegram-source-access.service';
import { decryptTelegramMtprotoCredentials } from '@api/telegram/shared/mtproto/telegram-mtproto-credentials';
import type { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import type { ChannelAvatarEmojiProcessorService } from '../telegram-channels/channel-avatar-emoji-processor.service';
import { telegramAccountCapabilityUpdate } from './telegram-user-account-login-finalizer';
import type { TelegramUserAccountProgressCallback } from './telegram-user-account-import-progress';
import {
  accountChannelAccessPayload,
  normalizeAccountChannelUsername,
} from './telegram-user-account-channel-import';

type AccountDialogSyncDependencies = {
  prisma: PrismaService;
  mtprotoClient: TelegramMtprotoClient;
  encryptionService: TokenEncryptionService;
  sourceAccessService: TelegramSourceAccessService;
  avatarEmojis?: ChannelAvatarEmojiProcessorService;
};

async function notifyProgress(
  onProgress: TelegramUserAccountProgressCallback | undefined,
  current: number,
  total: number,
  message: string,
) {
  if (!onProgress) return;
  await onProgress({ phase: 'sync_step', message }, current, total);
}

export async function syncTelegramUserAccountDialogs(
  dependencies: AccountDialogSyncDependencies,
  workspaceId: string,
  id: string,
  onProgress?: TelegramUserAccountProgressCallback,
  managedChannelIds?: readonly string[],
) {
  const account =
    await dependencies.prisma.telegramUserAccountIntegration.findFirst({
      where: { id, workspaceId, isActive: true },
    });
  if (!account) throw new NotFoundException('Telegram user account not found');
  if (
    !account.sessionEncrypted ||
    !account.sessionIv ||
    !account.sessionAuthTag
  ) {
    return { success: false, message: 'Connect account first', channels: [] };
  }

  await notifyProgress(
    onProgress,
    1,
    3,
    'Loading admin channels from Telegram',
  );
  const observedAt = new Date();
  const { channels, profile, complete } =
    await dependencies.mtprotoClient.getAdminChannelsWithProfile(
      decryptTelegramMtprotoCredentials(dependencies.encryptionService, {
        ...account,
        sessionEncrypted: account.sessionEncrypted,
        sessionIv: account.sessionIv,
        sessionAuthTag: account.sessionAuthTag,
      }),
      { includeChannelPhotos: !managedChannelIds },
    );

  await notifyProgress(
    onProgress,
    2,
    3,
    'Matching Telegram channels with workspace channels',
  );
  const workspaceChannels = await dependencies.prisma.telegramChannel.findMany({
    where: {
      workspaceId,
      isActive: true,
      ...(managedChannelIds ? { id: { in: [...managedChannelIds] } } : {}),
    },
    select: { id: true, username: true, telegramChatId: true },
  });
  const channelByUsername = new Map(
    workspaceChannels
      .filter(
        (channel) =>
          !normalizeTelegramChannelId(channel.telegramChatId) &&
          channel.username,
      )
      .map((channel) => [
        normalizeAccountChannelUsername(channel.username),
        channel.id,
      ]),
  );
  const channelByChatId = new Map(
    workspaceChannels
      .filter((channel) => normalizeTelegramChannelId(channel.telegramChatId))
      .map((channel) => [
        normalizeTelegramChannelId(channel.telegramChatId),
        channel.id,
      ]),
  );
  const matchedChannels = channels
    .map((channel) => ({
      channel,
      id:
        channelByChatId.get(normalizeTelegramChannelId(channel.id)) ||
        channelByUsername.get(
          normalizeAccountChannelUsername(channel.username),
        ),
    }))
    .filter(
      (row): row is { channel: (typeof channels)[number]; id: string } =>
        !!row.id,
    );
  const matchedChannelIds = new Set(
    matchedChannels.map(({ channel }) => channel.id),
  );
  const formatChannel = (channel: (typeof channels)[number]) => {
    const { normalized } = accountChannelAccessPayload(
      dependencies.sourceAccessService,
      channel,
    );
    return {
      ...normalized,
      channelId: channel.id,
      telegramChannelId: channel.id,
      title: channel.title,
      username: channel.username,
      photoUrl: channel.photoUrl,
      canBeUsedForAnalytics:
        dependencies.sourceAccessService.canBeUsedForAnalytics(
          normalized.permissions,
          normalized.role,
        ),
    };
  };

  await notifyProgress(onProgress, 3, 3, 'Saving channel access links');
  await dependencies.prisma.$transaction(async (tx) => {
    if (!managedChannelIds)
      await tx.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          telegramUserId: profile.id,
          username: profile.username,
          firstName: profile.firstName,
          lastName: profile.lastName,
          photoUrl: profile.photoUrl ?? null,
          nameColor: profile.nameColor ?? null,
          label:
            (profile.username &&
              `@${String(profile.username).replace('@', '')}`) ||
            profile.firstName ||
            account.label,
          lastSyncedAt: new Date(),
          lastCheckedAt: new Date(),
          status: TelegramUserAccountStatus.connected,
          lastErrorMessage: null,
          ...telegramAccountCapabilityUpdate(profile),
        },
      });
    const matchedIds = matchedChannels.map(({ id }) => id);
    if (complete) {
      await tx.telegramChannelAdminLink.deleteMany({
        where: {
          workspaceId,
          telegramUserAccountIntegrationId: account.id,
          telegramChannelId: {
            notIn: matchedIds,
            ...(managedChannelIds ? { in: [...managedChannelIds] } : {}),
          },
        },
      });
      await tx.telegramChannelSourceAccess.deleteMany({
        where: {
          workspaceId,
          sourceId: account.id,
          sourceType: TelegramSourceType.MTPROTO,
          channelId: {
            notIn: matchedIds,
            ...(managedChannelIds ? { in: [...managedChannelIds] } : {}),
          },
        },
      });
    }
    if (matchedIds.length) {
      await tx.telegramChannelAdminLink.createMany({
        data: matchedIds.map((telegramChannelId) => ({
          workspaceId,
          telegramChannelId,
          telegramUserAccountIntegrationId: account.id,
          source: 'mtproto',
        })),
        skipDuplicates: true,
      });
    }
    for (const { channel, id: channelId } of matchedChannels) {
      const { rawPermissions, normalized } = accountChannelAccessPayload(
        dependencies.sourceAccessService,
        channel,
      );
      await dependencies.sourceAccessService.upsertAccess(
        {
          workspaceId,
          channelId,
          sourceId: account.id,
          sourceType: TelegramSourceType.MTPROTO,
          role: normalized.role,
          permissions: normalized.permissions,
          rawPermissions,
        },
        tx,
        observedAt,
      );
      if (channel.isCreator) {
        // A verified creator rules out an older creator claim for another account.
        await tx.telegramChannelSourceAccess.updateMany({
          where: {
            workspaceId,
            channelId,
            sourceType: TelegramSourceType.MTPROTO,
            sourceId: { not: account.id },
            role: 'OWNER',
            lastCheckedAt: { lt: observedAt },
          },
          data: {
            role: 'UNKNOWN',
            rawPermissions: { isCreator: false, adminRights: null },
            canPostMessages: false,
            canEditMessages: false,
            canDeleteMessages: false,
            canInviteUsers: false,
            canManageInviteLinks: false,
            canViewStats: false,
          },
        });
      }
    }
  });
  for (const { channel, id: channelId } of matchedChannels) {
    if (channel.isCreator)
      await dependencies.avatarEmojis?.enqueueInitial(workspaceId, channelId);
  }

  return {
    success: true,
    channels,
    syncedChannels: matchedChannels.map(({ channel, id }) => ({
      ...formatChannel(channel),
      workspaceChannelId: id,
    })),
    availableChannels: channels
      .filter((channel) => !matchedChannelIds.has(channel.id))
      .map(formatChannel),
    matchedChannels: matchedChannels.length,
    message:
      matchedChannels.length > 0
        ? `Linked admin to ${matchedChannels.length} workspace channels`
        : 'No matching workspace channels by username',
  };
}

/** Manual account sync also reconciles existing managed channels for connected peers. */
export async function reconcileWorkspaceAccountDialogs(
  dependencies: AccountDialogSyncDependencies,
  workspaceId: string,
  accountId: string,
  onProgress?: TelegramUserAccountProgressCallback,
) {
  const [channels, peers] = await Promise.all([
    dependencies.prisma.telegramChannel.findMany({
      where: { workspaceId, isActive: true, adminLinks: { some: {} } },
      select: { id: true },
    }),
    dependencies.prisma.telegramUserAccountIntegration.findMany({
      where: {
        workspaceId,
        id: { not: accountId },
        isActive: true,
        status: TelegramUserAccountStatus.connected,
        sessionEncrypted: { not: null },
      },
      select: { id: true },
    }),
  ]);
  const result = await syncTelegramUserAccountDialogs(
    dependencies,
    workspaceId,
    accountId,
    onProgress,
  );
  if (!peers.length) return result;
  const ids = [
    ...new Set([
      ...channels.map(({ id }) => id),
      ...(result.syncedChannels ?? []).map(
        ({ workspaceChannelId }) => workspaceChannelId,
      ),
    ]),
  ];
  if (!ids.length) return result;

  await notifyProgress(
    onProgress,
    3,
    3,
    'Checking channel roles for connected accounts',
  );
  const outcomes = await runBounded(peers, 2, async ({ id }) => {
    try {
      return (
        await syncTelegramUserAccountDialogs(
          dependencies,
          workspaceId,
          id,
          undefined,
          ids,
        )
      ).success;
    } catch {
      return false;
    }
  });
  const refreshed = outcomes.filter(Boolean).length;
  return {
    ...result,
    message: `${result.message}. Checked roles for ${refreshed}/${peers.length} other accounts.`,
  };
}
