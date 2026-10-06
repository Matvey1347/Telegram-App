import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import {
  telegramChannelWorkbookInclude,
  TelegramChannelWorkbookDataService,
} from './telegram-channel-workbook-data.service';
import { TelegramChannelWorkbookWriter } from './telegram-channel-workbook.writer';
import {
  TELEGRAM_CHANNEL_EXPORT_SECTIONS,
  type TelegramChannelExportSection,
} from '@telegram-system/shared';

@Injectable()
export class TelegramChannelWorkbookExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TelegramChannelsSupportService,
    private readonly data: TelegramChannelWorkbookDataService,
    private readonly writer: TelegramChannelWorkbookWriter,
  ) {}
  async exportChannelWorkbook(
    userId: string,
    channelId: string,
    sections?: string[],
  ) {
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      include: telegramChannelWorkbookInclude,
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const selectedSections = sections?.filter(
      (section): section is TelegramChannelExportSection =>
        TELEGRAM_CHANNEL_EXPORT_SECTIONS.some((allowed) => allowed === section),
    );
    return this.writer.build(
      await this.data.load(workspaceId, channel),
      selectedSections?.length ? selectedSections : undefined,
    );
  }
}
