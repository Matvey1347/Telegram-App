import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  ChannelReminderAssignmentsDto,
  ChannelReminderTemplateDto,
} from './telegram-channel-reminders.dto';
import { TelegramChannelRemindersService } from './telegram-channel-reminders.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram/channel-reminders')
export class TelegramChannelRemindersController {
  constructor(private readonly service: TelegramChannelRemindersService) {}
  @Get() list(@CurrentUser() user: JwtUser) {
    return this.service.list(user.sub);
  }
  @Post('templates') create(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChannelReminderTemplateDto,
  ) {
    return this.service.create(user.sub, dto);
  }
  @Patch('templates/:id') update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: ChannelReminderTemplateDto,
  ) {
    return this.service.update(user.sub, id, dto);
  }
  @Delete('templates/:id') remove(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.service.remove(user.sub, id);
  }
  @Put('assignments') assign(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChannelReminderAssignmentsDto,
  ) {
    return this.service.assign(user.sub, dto);
  }
}
