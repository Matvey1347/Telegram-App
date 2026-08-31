import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramCrmContactMergeService } from './telegram-crm-contact-merge.service';
import { TelegramCrmInboxCommandService } from './telegram-crm-inbox-command.service';
import {
  CrmInboxQueryDto,
  MergeCrmContactsDto,
  PromoteCrmInboxPeerDto,
  SetCrmInboxStateDto,
} from './telegram-crm-inbox.dto';
import { TelegramCrmInboxReadService } from './telegram-crm-inbox-read.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-crm')
export class TelegramCrmInboxController {
  constructor(
    private readonly reads: TelegramCrmInboxReadService,
    private readonly commands: TelegramCrmInboxCommandService,
    private readonly merges: TelegramCrmContactMergeService,
  ) {}

  @Get('inbox')
  list(@CurrentUser() user: JwtUser, @Query() query: CrmInboxQueryDto) {
    return this.reads.list(user.sub, query);
  }

  @Post('inbox/:peerId/promote')
  promote(
    @CurrentUser() user: JwtUser,
    @Param('peerId') peerId: string,
    @Body() dto: PromoteCrmInboxPeerDto,
  ) {
    return this.commands.promote(user.sub, peerId, dto);
  }

  @Post('inbox/:peerId/state')
  setState(
    @CurrentUser() user: JwtUser,
    @Param('peerId') peerId: string,
    @Body() dto: SetCrmInboxStateDto,
  ) {
    return this.commands.setState(user.sub, peerId, dto);
  }

  @Post('contacts/:targetId/merge')
  merge(
    @CurrentUser() user: JwtUser,
    @Param('targetId') targetId: string,
    @Body() dto: MergeCrmContactsDto,
  ) {
    return this.merges.merge(user.sub, targetId, dto.sourceContactId);
  }
}
