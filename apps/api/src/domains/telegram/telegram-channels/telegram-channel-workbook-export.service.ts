import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import {
  telegramChannelWorkbookInclude,
  TelegramChannelWorkbookDataService,
} from './telegram-channel-workbook-data.service';
import { TelegramChannelWorkbookWriter } from './telegram-channel-workbook.writer';

@Injectable()
export class TelegramChannelWorkbookExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly support: TelegramChannelsSupportService,
    private readonly data: TelegramChannelWorkbookDataService,
    private readonly writer: TelegramChannelWorkbookWriter,
  ) {}
  async exportChannelWorkbook(userId: string, channelId: string) {
    const workspaceId = await this.support.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      include: telegramChannelWorkbookInclude,
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return this.writer.build(await this.data.load(workspaceId, channel));
  }
}
