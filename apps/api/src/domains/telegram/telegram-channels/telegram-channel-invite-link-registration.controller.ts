import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramInviteLinkRegistrationService } from './telegram-invite-link-registration.service';

class RegisterTelegramChannelInviteLinkDto {
  @IsString() @MaxLength(512) url!: string;
}

class CreateTelegramChannelInviteLinkDto {
  @IsString() @MaxLength(32) title!: string;
  @IsOptional() @IsString() mtprotoAccountId?: string;
  @IsOptional() @IsBoolean() requestNeeded?: boolean;
  @IsOptional() @IsISO8601() expiresAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usageLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) monthlyFeeStars?: number;
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

  @Post(':id/invite-links/create')
  create(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramChannelInviteLinkDto,
  ) {
    return this.registration.create(user.sub, id, dto);
  }
}
