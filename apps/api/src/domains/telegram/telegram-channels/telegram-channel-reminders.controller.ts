import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
} from 'class-validator';
import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  publicationNotificationDestinations,
  type PublicationNotificationDestination,
} from '@telegram-system/shared';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramChannelRemindersService } from './telegram-channel-reminders.service';

class PublicationNotificationsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(publicationNotificationDestinations)
  coverageDestination!: PublicationNotificationDestination;

  @IsIn(publicationNotificationDestinations)
  autopilotDestination!: PublicationNotificationDestination;

  @IsIn(publicationNotificationDestinations)
  autopilotErrorDestination!: PublicationNotificationDestination;

  @IsArray()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  excludedChannelIds!: string[];
}

@UseGuards(JwtAuthGuard)
@Controller('telegram/publication-notifications')
export class TelegramChannelRemindersController {
  constructor(private readonly service: TelegramChannelRemindersService) {}

  @Get()
  settings(@CurrentUser() user: JwtUser) {
    return this.service.settings(user.sub);
  }

  @Put()
  save(@CurrentUser() user: JwtUser, @Body() dto: PublicationNotificationsDto) {
    return this.service.save(user.sub, dto);
  }

  @Get('preview')
  sample(@CurrentUser() user: JwtUser) {
    return this.service.preview(user.sub);
  }

  @Get('preview/:channelId')
  preview(@CurrentUser() user: JwtUser, @Param('channelId') channelId: string) {
    return this.service.preview(user.sub, channelId);
  }
}
