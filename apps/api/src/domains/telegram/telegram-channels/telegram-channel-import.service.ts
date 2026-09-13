import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  TelegramChannelDataType,
  TelegramDataSourceStatus,
  TelegramSourceType,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  canonicalTelegramInviteLink,
  parseTelegramImportInput,
  type ResolvedTelegramEntity,
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
import { TelegramPostGroupStore } from './telegram-post-group.store';
import { REVOKED_TELEGRAM_SESSION_MESSAGE } from '../../../telegram/shared/telegram-session-errors';

type TelegramChannelBatchImportProgress = {
  input: string;
  success: boolean;
  channelId?: string;
  error?: string;
};

type TelegramChannelBatchImportProgressCallback = (
  item: TelegramChannelBatchImportProgress,
  current: number,
  total: number,
) => void | Promise<void>;

function isImportedChannelRecord(
  value: unknown,
): value is { id: string; kind?: unknown } & Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

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
    private readonly telegramPostGroupStore: TelegramPostGroupStore,
  ) {}
  private readonly logger = new Logger('TelegramChannelsService');

  private readonly initialPostBackfillLimit = 50;

  private readonly olderPostBackfillMaxPages = 5;

  async importChannels(
    userId: string,
    inputs: string[],
    onProgress?: TelegramChannelBatchImportProgressCallback,
  ): Promise<{
    channels: unknown[];
    failures: Array<{ input: string; error: string }>;
  }> {
    const uniqueInputs = [
      ...new Set(inputs.map((input) => input.trim())),
    ].filter(Boolean);
    const channels: unknown[] = [];
    const failures: Array<{ input: string; error: string }> = [];

    for (const [index, input] of uniqueInputs.entries()) {
      try {
        const imported: unknown = await this.importChannel(
          userId,
          { input },
          undefined,
          { runInitialSync: false },
        );
        if (!isImportedChannelRecord(imported)) {
          throw new BadRequestException(
            'Telegram did not return a valid channel after import.',
          );
        }
        if (imported.kind === 'person') {
          throw new BadRequestException(
            'The Telegram reference resolves to a person, not a channel.',
          );
        }
        channels.push(imported);
        await onProgress?.(
          { input, success: true, channelId: imported.id },
          index + 1,
          uniqueInputs.length,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Telegram channel import failed.';
        failures.push({ input, error: message });
        await onProgress?.(
          { input, success: false, error: message },
          index + 1,
          uniqueInputs.length,
        );
      }
    }

    return { channels, failures };
  }

  async importChannel(
    userId: string,
    dto: ImportTelegramChannelDto,
    onProgress?: BulkProgressCallback,
    options: { runInitialSync?: boolean } = {},
  ) {
    const workspaceId =
      await this.telegramChannelsSupportService.workspace(userId);
    const accounts =
      await this.telegramChannelImportPreparationService.connectedAccounts(
        workspaceId,
        userId,
      );
    const rawInput = dto.input ?? dto.username;
    const importInput = parseTelegramImportInput(rawInput || '');
    const steps =
      this.telegramChannelImportPreparationService.importProgressSteps(
        importInput.type,
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
    let account = accounts[0];
    let info: ResolvedTelegramEntity | undefined;
    for (const candidate of accounts) {
      try {
        this.logger.log(
          `Importing Telegram source: inputType=${importInput.type} account=${candidate.id} invite=${importInput.type === 'invite' ? maskTelegramInviteHash(importInput.inviteHash) : 'n/a'}`,
        );
        info =
          this.telegramChannelImportPreparationService.ensureImportableChannelEntity(
            await this.telegramChannelImportPreparationService.resolveImportEntity(
              candidate,
              importInput,
            ),
            importInput.type,
          );
        account = candidate;
        break;
      } catch (error) {
        const invalidSession =
          await this.telegramChannelImportPreparationService.markInvalidSession(
            candidate.id,
            error,
          );
        if (!invalidSession) throw error;
      }
    }
    if (!info) throw new BadRequestException(REVOKED_TELEGRAM_SESSION_MESSAGE);
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
      let persisted;
      if (!existing) {
        persisted = await tx.telegramChannel.create({
          data: {
            workspaceId,
            ...payload,
          },
        });
      } else {
        const duplicateIds = matchingChannels
          .filter((candidate) => candidate.id !== existing.id)
          .map((candidate) => candidate.id);
        await this.telegramChannelImportPreparationService.mergeDuplicateChannels(
          tx,
          workspaceId,
          existing.id,
          duplicateIds,
        );
        persisted = await tx.telegramChannel.update({
          where: { id: existing.id },
          data: { ...payload, isActive: true },
        });
      }
      await this.telegramPostGroupStore.ensureRequiredChannelSystemGroups(
        tx,
        workspaceId,
        persisted.id,
      );
      return persisted;
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
      options.runInitialSync === false
        ? { success: true, skipped: true }
        : await this.telegramChannelImportPreparationService.runInitialImportBackfill(
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
