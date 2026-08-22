import { Injectable, Logger } from '@nestjs/common';
import {
  TelegramChannelDataType,
  TelegramDataSourceStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  canonicalTelegramInviteLink,
  parseTelegramImportInput,
} from '../../../telegram/shared/telegram-import.helpers';
import { TelegramMtprotoClient } from '../../../telegram/shared/telegram-mtproto.client';
import { maskTelegramInviteHash } from '../../../telegram/shared/telegram-invite-log';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { ImportTelegramChannelDto } from './dto';
import { TelegramBroadcastStatsService } from './telegram-broadcast-stats.service';
import { TelegramChannelAccessService } from './telegram-channel-access.service';
import { TelegramChannelCatalogService } from './telegram-channel-catalog.service';
import { TelegramChannelHistoricalSyncService } from './telegram-channel-historical-sync.service';
import { TelegramChannelImportPolicyService } from './telegram-channel-import-policy.service';
import { TelegramChannelImportPreparationService } from './telegram-channel-import-preparation.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import { BulkProgressCallback } from './telegram-channels.internal';
import { TelegramPostMetricsService } from './telegram-post-metrics.service';

@Injectable()
export class TelegramChannelImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mtprotoClient: TelegramMtprotoClient,
    private readonly sourceAccessService: TelegramSourceAccessService,
    private readonly telegramChannelsSupportService: TelegramChannelsSupportService,
    private readonly telegramChannelAccessService: TelegramChannelAccessService,
    private readonly telegramChannelImportPolicyService: TelegramChannelImportPolicyService,
    private readonly telegramChannelCatalogService: TelegramChannelCatalogService,
    private readonly telegramChannelHistoricalSyncService: TelegramChannelHistoricalSyncService,
    private readonly telegramPostMetricsService: TelegramPostMetricsService,
    private readonly telegramBroadcastStatsService: TelegramBroadcastStatsService,
    private readonly telegramChannelImportPreparationService: TelegramChannelImportPreparationService,
  ) {}
  private readonly logger = new Logger('TelegramChannelsService');

  private readonly initialPostBackfillLimit = 50;

  private readonly olderPostBackfillMaxPages = 5;

  async importChannel(
    userId: string,
    dto: ImportTelegramChannelDto,
    onProgress?: BulkProgressCallback,
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const account =
      await this.telegramChannelImportPreparationService.firstConnectedAccount(
        workspaceId,
      );
    const rawInput = dto.input ?? dto.username;
    const importInput = parseTelegramImportInput(rawInput || '');
    const steps =
      this.telegramChannelImportPreparationService.importProgressSteps(
        importInput.type,
      );
    this.logger.log(
      `Importing Telegram source: inputType=${importInput.type} account=${account.id} invite=${importInput.type === 'invite' ? maskTelegramInviteHash(importInput.inviteHash) : 'n/a'}`,
    );

    await this.telegramChannelImportPreparationService.notifyImportProgress(
      onProgress,
      steps,
      0,
    );
    if (importInput.type === 'invite') {
      await this.telegramChannelImportPreparationService.notifyImportProgress(
        onProgress,
        steps,
        1,
      );
    }
    await this.telegramChannelImportPreparationService.notifyImportProgress(
      onProgress,
      steps,
      importInput.type === 'invite' ? 2 : 1,
    );
    const info =
      this.telegramChannelImportPreparationService.ensureImportableChannelEntity(
        await this.telegramChannelImportPreparationService.resolveImportEntity(
          account,
          importInput,
        ),
        importInput.type,
      );
    const username = this.telegramChannelsSupportService.normalizeUsername(
      info.username,
    );
    if (info.kind === 'person') {
      return this.telegramChannelImportPreparationService.upsertImportedPerson(
        workspaceId,
        {
          title: info.title,
          username,
          description: info.description,
          photoUrl: info.photoUrl,
        },
      );
    }
    const telegramChatId = info.telegramChatId || null;
    const matchingChannels =
      await this.telegramChannelImportPreparationService.findMatchingChannels(
        workspaceId,
        username,
        telegramChatId,
      );
    const existing =
      this.telegramChannelImportPreparationService.pickCanonicalChannel(
        matchingChannels,
      );
    const defaultCutoff = new Date();
    const importPolicy =
      await this.telegramChannelImportPolicyService.resolveImportPolicy({
        workspaceId,
        channelId: existing?.id ?? null,
        input: dto,
        existing: existing
          ? {
              acquisitionType:
                (
                  existing as {
                    acquisitionType?: 'CREATED' | 'PURCHASED' | null;
                  }
                ).acquisitionType ?? null,
              postsSyncFrom:
                (existing as { postsSyncFrom?: Date | null }).postsSyncFrom ??
                null,
              inviteLinksSyncFrom:
                (existing as { inviteLinksSyncFrom?: Date | null })
                  .inviteLinksSyncFrom ?? null,
              purchaseTransactionId:
                (existing as { purchaseTransactionId?: string | null })
                  .purchaseTransactionId ?? null,
            }
          : null,
        defaultNow: defaultCutoff,
      });
    const payload = {
      ...this.telegramChannelAccessService.channelIdentityPatch({
        ...info,
        inviteLink:
          importInput.type === 'invite'
            ? canonicalTelegramInviteLink(importInput.inviteHash)
            : info.inviteLink || undefined,
      }),
      sourceType: 'telegram',
      lastPublicSyncedAt: new Date(),
      acquisitionType: importPolicy.acquisitionType,
      postsSyncFrom: importPolicy.postsSyncFrom,
      inviteLinksSyncFrom: importPolicy.inviteLinksSyncFrom,
      purchaseTransactionId: importPolicy.purchaseTransactionId,
    };
    await this.telegramChannelImportPreparationService.notifyImportProgress(
      onProgress,
      steps,
      importInput.type === 'invite' ? 3 : 2,
    );
    const channel = await this.prisma.$transaction(async (tx) => {
      if (!existing) {
        return tx.telegramChannel.create({
          data: {
            workspaceId,
            ...payload,
          },
        });
      }
      const duplicateIds = matchingChannels
        .filter((candidate) => candidate.id !== existing.id)
        .map((candidate) => candidate.id);
      await this.telegramChannelImportPreparationService.mergeDuplicateChannels(
        tx,
        workspaceId,
        existing.id,
        duplicateIds,
      );
      return tx.telegramChannel.update({
        where: { id: existing.id },
        data: { ...payload, isActive: true },
      });
    });
    await this.sourceAccessService.recordDataSource({
      workspaceId,
      channelId: channel.id,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.CHANNEL_INFO,
      status: TelegramDataSourceStatus.SUCCESS,
      sourceDisplayName:
        this.telegramChannelAccessService.sourceDisplayName(account),
      metadata: {
        source: 'channel_import',
        inputType: importInput.type,
        joinedByInvite: Boolean(info.joinedByInvite),
      },
    });
    await this.telegramChannelImportPreparationService.notifyImportProgress(
      onProgress,
      steps,
      importInput.type === 'invite' ? 4 : 3,
    );
    const importedChannel = await this.telegramChannelCatalogService.findOne(
      userId,
      channel.id,
    );
    const initialSync =
      await this.telegramChannelImportPreparationService.runInitialImportBackfill(
        {
          userId,
          workspaceId,
          channelId: channel.id,
          accountId: account.id,
        },
      );
    this.logger.log(
      `Imported Telegram entity: kind=${info.kind} chatId=${info.telegramChatId} joinedByInvite=${Boolean(info.joinedByInvite)} backfillSuccess=${Boolean(initialSync?.success)}`,
    );
    return { ...importedChannel, initialSync };
  }
}
