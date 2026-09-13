import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramChannelsSupportService } from './telegram-channels-support.service';
import {
  MAX_TELEGRAM_POST_MEDIA_BYTES,
  TelegramManagedPostMediaStorageService,
} from './telegram-managed-post-media-storage.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-post-media')
export class TelegramManagedPostMediaController {
  constructor(
    private readonly support: TelegramChannelsSupportService,
    private readonly media: TelegramManagedPostMediaStorageService,
  ) {}

  @Post('upload')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_TELEGRAM_POST_MEDIA_BYTES },
    }),
  )
  async upload(
    @CurrentUser() user: JwtUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('kind') requestedKind?: string,
  ) {
    await this.support.workspace(user.sub);
    if (!file) throw new BadRequestException('Media file is required');
    const kind =
      requestedKind === 'ANIMATION' || requestedKind === 'VIDEO'
        ? requestedKind
        : file.mimetype === 'image/gif'
          ? 'ANIMATION'
          : file.mimetype.startsWith('video/')
            ? 'VIDEO'
            : 'PHOTO';
    return {
      media: await this.media.persistMediaBytes({
        bytes: file.buffer,
        contentType: file.mimetype,
        fileName: file.originalname,
        kind,
      }),
    };
  }
}
