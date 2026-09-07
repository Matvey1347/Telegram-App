import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { ImportTelegramCustomEmojiPackDto } from './telegram-custom-emoji.dto';
import { TelegramCustomEmojiService } from './telegram-custom-emoji.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-custom-emoji-packs')
export class TelegramCustomEmojiController {
  constructor(private readonly service: TelegramCustomEmojiService) {}
  @Get() list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.sub);
  }
  @Post('import') import(
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportTelegramCustomEmojiPackDto,
  ) {
    return this.service.importPack(user.sub, { source: dto.source });
  }
  @Delete(':packId') detach(
    @CurrentUser() user: JwtUser,
    @Param('packId') packId: string,
  ) {
    return this.service.deletePack(user.sub, packId);
  }
}
