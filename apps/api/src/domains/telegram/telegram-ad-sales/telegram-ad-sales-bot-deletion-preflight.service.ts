import { BadRequestException, Injectable } from '@nestjs/common';
import {
  TelegramSourceType,
  TelegramUserAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { requiresNativeTelegramRichMessage } from '../../../telegram/shared/telegram-markup';
import { TelegramSourceAccessService } from '../../../telegram/shared/telegram-source-access.service';
import { preflightTelegramAdDeletionCapability } from './domain/deletion-capability';

type DeletionFormat = {
  deleteAfterHours: number | null;
  isPermanent: boolean;
};

type DeliveryContent = {
  text?: string | null;
  imageUrls?: string[];
  buttonRows?: unknown;
  sourceType?: string | null;
};

@Injectable()
export class TelegramAdSalesBotDeletionPreflightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceAccess: TelegramSourceAccessService,
  ) {}

  async assertAvailable(input: {
    workspaceId: string;
    channelIds: string[];
    format: DeletionFormat;
    content: DeliveryContent;
  }) {
    if (
      input.format.isPermanent ||
      input.format.deleteAfterHours === null ||
      input.format.deleteAfterHours < 48
    ) {
      return;
    }

    const capabilities = await this.sourceAccess.publishingCapabilitiesForChannels(
      input.workspaceId,
      input.channelIds,
    );
    const accessRows = await this.prisma.telegramChannelSourceAccess.findMany({
      where: {
        workspaceId: input.workspaceId,
        channelId: { in: input.channelIds },
        sourceType: TelegramSourceType.MTPROTO,
        canDeleteMessages: true,
      },
      select: { channelId: true, sourceId: true },
    });
    const accountIds = [...new Set(accessRows.map((row) => row.sourceId))];
    const accounts = accountIds.length
      ? await this.prisma.telegramUserAccountIntegration.findMany({
          where: {
            id: { in: accountIds },
            workspaceId: input.workspaceId,
            isActive: true,
            status: TelegramUserAccountStatus.connected,
            sessionEncrypted: { not: null },
            sessionIv: { not: null },
            sessionAuthTag: { not: null },
          },
          select: { id: true },
        })
      : [];
    const activeAccountIds = new Set(accounts.map((account) => account.id));
    const requiresBot =
      (Array.isArray(input.content.buttonRows) &&
        input.content.buttonRows.length > 0) ||
      (!(input.content.imageUrls?.length ?? 0) &&
        requiresNativeTelegramRichMessage(input.content.text ?? ''));

    for (const channelId of input.channelIds) {
      const capability = capabilities.get(channelId);
      if (requiresBot && !capability?.canPublishInlineButtons) {
        throw new BadRequestException(
          'Publishing this post requires an active bot with posting permission',
        );
      }
      const publishingSourceType =
        input.content.sourceType ??
        (requiresBot ? TelegramSourceType.BOT : capability?.source?.sourceType);
      if (!publishingSourceType) {
        throw new BadRequestException(
          'No connected Telegram source has posting permission',
        );
      }
      const sources = accessRows
        .filter(
          (row) =>
            row.channelId === channelId && activeAccountIds.has(row.sourceId),
        )
        .map(() => ({
          sourceType: TelegramSourceType.MTPROTO,
          permissions: { canDeleteMessages: true },
        }));
      const result = preflightTelegramAdDeletionCapability({
        publishingSourceType,
        deleteAfterHours: input.format.deleteAfterHours,
        isPermanent: input.format.isPermanent,
        sources,
      });
      if (!result.ok) throw new BadRequestException(result);
    }
  }
}
