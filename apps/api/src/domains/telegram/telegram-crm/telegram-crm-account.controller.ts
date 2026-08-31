import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramCrmAccountCapabilitiesService } from './telegram-crm-account-capabilities.service';
import { UpdateCrmAccountCapabilitiesDto } from './telegram-crm.dto';
import { TelegramCrmSyncStateService } from './telegram-crm-sync-state.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-crm/accounts')
export class TelegramCrmAccountController {
  constructor(
    private readonly capabilities: TelegramCrmAccountCapabilitiesService,
    private readonly syncState: TelegramCrmSyncStateService,
  ) {}

  @Get(':accountId/capabilities')
  getCapabilities(
    @CurrentUser() user: JwtUser,
    @Param('accountId') accountId: string,
  ) {
    return this.capabilities.get(user.sub, accountId);
  }

  @Patch(':accountId/capabilities')
  updateCapabilities(
    @CurrentUser() user: JwtUser,
    @Param('accountId') accountId: string,
    @Body() dto: UpdateCrmAccountCapabilitiesDto,
  ) {
    return this.capabilities.update(user.sub, accountId, dto);
  }

  @Get(':accountId/sync-state')
  getSyncState(
    @CurrentUser() user: JwtUser,
    @Param('accountId') accountId: string,
  ) {
    return this.syncState.get(user.sub, accountId);
  }
}
