import { NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TelegramChannelDataType,
  TelegramSourceType,
  type TelegramChannel,
} from '@prisma/client';
import { normalizeTelegramChannelId } from '@api/telegram/shared/imports/telegram-post-url';
import { telegramChannelRawPermissions } from '@api/telegram/shared/imports/telegram-import.helpers';
import type { TelegramSourceAccessService } from '@api/telegram/shared/imports/telegram-source-access.service';
import type { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import type { ChannelAvatarEmojiProcessorService } from '../telegram-channels/channel-avatar-emoji-processor.service';
import type { TelegramChannelImportPolicyService } from '../telegram-channels/telegram-channel-import-policy.service';
import type { TelegramChannelSyncOrchestrator } from '../telegram-channels/telegram-channel-sync.orchestrator';
import type { ImportUserAccountChannelsDto } from './dto';
import {
  channelImportProgress,
  type ImportedTelegramUserAccountChannel,
  type TelegramUserAccountProgressCallback,
} from './telegram-user-account-import-progress';

type ProgressCallback = TelegramUserAccountProgressCallback;

type ChannelImportDependencies = {
  prisma: PrismaService;
  encryptionService: TokenEncryptionService;
  mtprotoClient: TelegramMtprotoClient;
  sourceAccessService: TelegramSourceAccessService;
  telegramChannelImportPolicyService: TelegramChannelImportPolicyService;
  telegramChannelSyncOrchestrator: TelegramChannelSyncOrchestrator;
  avatarEmojis?: ChannelAvatarEmojiProcessorService;
};

export function normalizeAccountChannelUsername(
  value: string | null | undefined,
) {
  return (value || '').replace('@', '').trim().toLowerCase();
}

function sourceDisplayName(account: {
  username?: string | null;
  firstName?: string | null;
  label: string;
}) {
  return (
    (account.username && `@${String(account.username).replace('@', '')}`) ||
    account.firstName ||
    account.label
  );
}

export function accountChannelAccessPayload(
  sourceAccessService: TelegramSourceAccessService,
  channel: {
    isCreator?: boolean;
    adminRights?: Record<string, unknown> | null;
  },
) {
  const rawPermissions = telegramChannelRawPermissions(channel);
  const normalized =
    sourceAccessService.normalizeMtprotoPermissions(rawPermissions);
  return { rawPermissions, normalized };
}

export async function importTelegramUserAccountChannels(
  dependencies: ChannelImportDependencies,
  workspaceId: string,
  userId: string,
  id: string,
  dto: ImportUserAccountChannelsDto,
  onProgress?: ProgressCallback,
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
  const apiHash = dependencies.encryptionService.decrypt({
    encrypted: account.apiHashEncrypted,
    iv: account.apiHashIv,
    authTag: account.apiHashAuthTag,
  });
  const session = dependencies.encryptionService.decrypt({
    encrypted: account.sessionEncrypted,
    iv: account.sessionIv,
    authTag: account.sessionAuthTag,
  });
  const dialogs = await dependencies.mtprotoClient.getAdminChannels({
    apiId: account.apiId,
    apiHash,
    session,
  });
  const selectedIds = new Set(
    dto.channels.map((value) => String(value.telegramChannelId)),
  );
  const requestedPolicies = new Map(
    dto.channels.map(
      (value) => [String(value.telegramChannelId), value] as const,
    ),
  );
  const selectedChannels = dialogs.filter((channel) =>
    selectedIds.has(channel.id),
  );
  if (!selectedChannels.length) {
    return { success: true, channels: [], message: 'No channels selected' };
  }
  await channelImportProgress({
    onProgress,
    channelIndex: 0,
    channelCount: selectedChannels.length,
  }).preparing();
  await dependencies.telegramChannelImportPolicyService.ensureStorageAvailable();
  const existingChannels = await dependencies.prisma.$queryRaw<
    Pick<
      TelegramChannel,
      | 'id'
      | 'username'
      | 'telegramChatId'
      | 'acquisitionType'
      | 'postsSyncFrom'
      | 'inviteLinksSyncFrom'
      | 'purchaseTransactionId'
    >[]
  >(Prisma.sql`
    SELECT "id", "username", "telegramChatId", "acquisitionType", "postsSyncFrom", "inviteLinksSyncFrom", "purchaseTransactionId"
    FROM "TelegramChannel" WHERE "workspaceId" = ${workspaceId} AND "isActive" = true
  `);
  const findExistingId = (channel: (typeof dialogs)[number]) =>
    existingChannels.find(
      (existing) =>
        (normalizeAccountChannelUsername(existing.username) &&
          normalizeAccountChannelUsername(existing.username) ===
            normalizeAccountChannelUsername(channel.username)) ||
        (normalizeTelegramChannelId(existing.telegramChatId) &&
          normalizeTelegramChannelId(existing.telegramChatId) ===
            normalizeTelegramChannelId(channel.id)),
    )?.id;
  const imported: ImportedTelegramUserAccountChannel[] = [];
  const defaultCutoff = new Date();
  for (const [channelIndex, channel] of selectedChannels.entries()) {
    const progress = channelImportProgress({
      onProgress,
      channelIndex,
      channelCount: selectedChannels.length,
    });
    await progress.adding(channel.title);
    const { rawPermissions, normalized } = accountChannelAccessPayload(
      dependencies.sourceAccessService,
      channel,
    );
    const existingId = findExistingId(channel);
    const existingChannel =
      existingChannels.find((candidate) => candidate.id === existingId) ?? null;
    const importPolicy =
      await dependencies.telegramChannelImportPolicyService.resolveChannelImportPolicy(
        {
          workspaceId,
          channelId: existingId ?? null,
          input: requestedPolicies.get(channel.id),
          existing: existingChannel,
          defaultNow: defaultCutoff,
        },
      );
    const workspaceChannel = existingId
      ? await (dependencies.prisma.telegramChannel as any).update({
          where: { id: existingId },
          data: {
            title: channel.title,
            username: normalizeAccountChannelUsername(channel.username),
            telegramChatId: channel.id,
            isActive: true,
          },
        })
      : await (dependencies.prisma.telegramChannel as any).create({
          data: {
            workspaceId,
            title: channel.title,
            username: normalizeAccountChannelUsername(channel.username),
            telegramChatId: channel.id,
            sourceType: 'telegram',
            lastPublicSyncedAt: new Date(),
          },
        });
    await dependencies.prisma.$executeRaw(
      Prisma.sql`
        UPDATE "TelegramChannel"
        SET
          "acquisitionType" = ${importPolicy.acquisitionType}::"TelegramChannelAcquisitionType",
          "postsSyncFrom" = ${importPolicy.postsSyncFrom},
          "inviteLinksSyncFrom" = ${importPolicy.inviteLinksSyncFrom},
          "purchaseTransactionId" = ${importPolicy.purchaseTransactionId}
        WHERE "id" = ${workspaceChannel.id}
      `,
    );
    await dependencies.prisma.telegramChannelAdminLink.upsert({
      where: {
        workspaceId_telegramChannelId_telegramUserAccountIntegrationId: {
          workspaceId,
          telegramChannelId: workspaceChannel.id,
          telegramUserAccountIntegrationId: account.id,
        },
      },
      create: {
        workspaceId,
        telegramChannelId: workspaceChannel.id,
        telegramUserAccountIntegrationId: account.id,
        source: 'mtproto',
      },
      update: { source: 'mtproto' },
    });
    await dependencies.sourceAccessService.upsertAccess({
      workspaceId,
      channelId: workspaceChannel.id,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      role: normalized.role,
      permissions: normalized.permissions,
      rawPermissions,
    });
    if (normalized.role === 'OWNER')
      await dependencies.avatarEmojis?.enqueueInitial(
        workspaceId,
        workspaceChannel.id,
      );
    await dependencies.sourceAccessService.recordDataSource({
      workspaceId,
      channelId: workspaceChannel.id,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.CHANNEL_INFO,
      sourceDisplayName: sourceDisplayName(account),
      metadata: {
        source: 'mtproto_dialog_import',
        telegramDialogChannelId: channel.id,
      },
    });
    imported.push({
      channelId: channel.id,
      workspaceChannelId: workspaceChannel.id,
      title: workspaceChannel.title,
      username: workspaceChannel.username,
      role: normalized.role,
      permissions: normalized.permissions,
      canBeUsedForAnalytics:
        dependencies.sourceAccessService.canBeUsedForAnalytics(
          normalized.permissions,
          normalized.role,
        ),
    });
    await progress.syncing(workspaceChannel.title);
    await dependencies.telegramChannelSyncOrchestrator.syncNow(
      userId,
      workspaceChannel.id,
      {},
      progress.forward(workspaceChannel.title),
    );
    await progress.completed(workspaceChannel.title);
  }
  return {
    success: true,
    channels: imported,
    message: `Added and synced ${imported.length} channels from ${sourceDisplayName(account)}`,
  };
}
