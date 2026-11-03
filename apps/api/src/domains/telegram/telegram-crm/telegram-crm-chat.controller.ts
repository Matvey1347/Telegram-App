import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  TelegramCrmChatOperations,
  CRM_CHAT_MEDIA_LIMIT,
} from './telegram-crm-chat-operations.service';
import { TelegramCrmChatMedia } from './telegram-crm-chat-media.service';
import {
  CrmReactionAssetsDto,
  CrmChatActionDto,
  CrmChatMediaDto,
} from './telegram-crm-chat.dto';
import { TelegramCrmReactionAssetsService } from './telegram-crm-reaction-assets.service';
import { TelegramCrmChatTransferGuard } from './telegram-crm-chat-transfer.guard';
@UseGuards(JwtAuthGuard)
@Controller('telegram-crm/conversations/:conversationId')
export class TelegramCrmChatController {
  constructor(
    private readonly operations: TelegramCrmChatOperations,
    private readonly media: TelegramCrmChatMedia,
    private readonly reactionAssets: TelegramCrmReactionAssetsService,
  ) {}
  @Post('reaction-assets') reactionAssetsForMessages(
    @CurrentUser() user: JwtUser,
    @Param('conversationId') id: string,
    @Body() input: CrmReactionAssetsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'private, no-store');
    const abort = new AbortController();
    const onClose = () => {
      if (!response.writableEnded) abort.abort();
    };
    response.once('close', onClose);
    return this.reactionAssets
      .get(user.sub, id, input.messageIds, abort.signal, input.documentIds)
      .finally(() => response.off('close', onClose));
  }
  @Get('chat-capabilities') capabilities(
    @CurrentUser() user: JwtUser,
    @Param('conversationId') id: string,
  ) {
    return this.operations.capabilities(user.sub, id);
  }
  @Post('message-actions') action(
    @CurrentUser() user: JwtUser,
    @Param('conversationId') id: string,
    @Body() input: CrmChatActionDto,
  ) {
    return this.operations.execute(user.sub, id, input);
  }
  @Get('message-actions/:operationId') status(
    @CurrentUser() user: JwtUser,
    @Param('conversationId') id: string,
    @Param('operationId') operationId: string,
  ) {
    return this.operations.status(user.sub, id, operationId);
  }
  @Post('media')
  @UseGuards(TelegramCrmChatTransferGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: CRM_CHAT_MEDIA_LIMIT,
        files: 1,
        fields: 4,
        fieldSize: 4096,
        parts: 5,
      },
    }),
  )
  upload(
    @CurrentUser() user: JwtUser,
    @Param('conversationId') id: string,
    @Body() input: CrmChatMediaDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.media.upload(user.sub, id, input, file);
  }
  @Get('messages/:messageId/media')
  @UseGuards(TelegramCrmChatTransferGuard)
  async download(
    @CurrentUser() user: JwtUser,
    @Param('conversationId') id: string,
    @Param('messageId') messageId: string,
    @Res() response: Response,
  ) {
    const file = await this.media.download(user.sub, id, messageId);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const safeMime =
      /^(image\/(jpeg|png|gif|webp)|audio\/(ogg|mpeg|mp4|webm|wav)|video\/(mp4|webm)|application\/pdf|text\/plain)$/.test(
        file.mimeType,
      )
        ? file.mimeType
        : 'application/octet-stream';
    response.setHeader('Content-Type', safeMime);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    response.setHeader('Content-Length', file.data.length);
    response.end(file.data);
  }
}
