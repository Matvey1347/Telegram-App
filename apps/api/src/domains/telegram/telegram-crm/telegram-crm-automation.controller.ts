import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramCrmAutomationStatusService } from './telegram-crm-automation-status.service';
import { TelegramCrmContactAutomationService } from './telegram-crm-contact-automation.service';
import { TelegramCrmDealAutomationService } from './telegram-crm-deal-automation.service';
import {
  CrmAutomationStatusQueryDto,
  UpdateCrmContactAutomationDto,
  UpdateCrmCustomerFollowUpDto,
} from './telegram-crm.dto';

@UseGuards(JwtAuthGuard)
@Controller('telegram-crm')
export class TelegramCrmAutomationController {
  constructor(
    private readonly statuses: TelegramCrmAutomationStatusService,
    private readonly contacts: TelegramCrmContactAutomationService,
    private readonly deals: TelegramCrmDealAutomationService,
  ) {}

  @Get('automations/status')
  status(
    @CurrentUser() user: JwtUser,
    @Query() query: CrmAutomationStatusQueryDto,
  ) {
    return this.statuses.get(user.sub, query);
  }

  @Patch('contacts/:id/automation')
  updateContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateCrmContactAutomationDto,
  ) {
    return this.contacts.update(user.sub, id, dto);
  }

  @Patch('deals/:id/automation/follow-up')
  updateFollowUp(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateCrmCustomerFollowUpDto,
  ) {
    return this.deals.updateFollowUp(user.sub, id, dto);
  }
}
