import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, type JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramUnifiedImportDto } from './telegram-unified-import.dto';
import { TelegramUnifiedImportService } from './telegram-unified-import.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:channelId/unified-import')
export class TelegramUnifiedImportController {
  constructor(private readonly service: TelegramUnifiedImportService) {}
  @Post('preview') preview(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string, @Body() dto: TelegramUnifiedImportDto) { return this.service.preview(user.sub, channelId, dto); }
  @Post('apply') apply(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string, @Headers('x-manifest-hash') manifestHash: string, @Body() dto: TelegramUnifiedImportDto) { return this.service.apply(user.sub, channelId, dto, manifestHash); }
}
