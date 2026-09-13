import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramInviteLinkRegistrationService } from './telegram-invite-link-registration.service';

class RegisterTelegramChannelInviteLinkDto {
  @IsString() @MaxLength(512) url!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramChannelInviteLinkRegistrationController {
  constructor(
    private readonly registration: TelegramInviteLinkRegistrationService,
  ) {}

  @Post(':id/invite-links/register')
  register(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: RegisterTelegramChannelInviteLinkDto,
  ) {
    return this.registration.register(user.sub, id, dto.url);
  }
}
