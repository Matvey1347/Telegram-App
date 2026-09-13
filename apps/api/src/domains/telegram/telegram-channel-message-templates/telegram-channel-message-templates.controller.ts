import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  TelegramChannelMessageTemplatePayloadDto,
  TelegramMessageTemplateSourceDto,
} from './dto';
import { TelegramChannelMessageTemplatesService } from './telegram-channel-message-templates.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channel-message-templates')
export class TelegramChannelMessageTemplatesController {
  constructor(
    private readonly service: TelegramChannelMessageTemplatesService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.sub);
  }

  @Post('source')
  source(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramMessageTemplateSourceDto,
  ) {
    return this.service.source(user.sub, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.get(user.sub, id);
  }

  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramChannelMessageTemplatePayloadDto,
  ) {
    return this.service.create(user.sub, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: TelegramChannelMessageTemplatePayloadDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.remove(user.sub, id);
  }
}
