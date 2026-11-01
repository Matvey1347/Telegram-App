import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramCrmSalesWorkflowService } from './telegram-crm-sales-workflow.service';
import { TelegramCrmInboxFollowUpService } from './telegram-crm-inbox-follow-up.service';
import { TelegramCrmPurchaseContextService } from './telegram-crm-purchase-context.service';
import { TelegramCrmPackageSalesContextService } from './telegram-crm-package-sales-context.service';
import {
  CrmFollowUpActionDto,
  CrmSalesContextQueryDto,
  CrmSalesStatusDto,
  CrmScheduleFollowUpDto,
} from './telegram-crm-sales-workflow.dto';

@UseGuards(JwtAuthGuard)
@Controller('telegram-crm')
export class TelegramCrmSalesWorkflowController {
  constructor(
    private readonly workflow: TelegramCrmSalesWorkflowService,
    private readonly followUps: TelegramCrmInboxFollowUpService,
    private readonly purchases: TelegramCrmPurchaseContextService,
    private readonly packages: TelegramCrmPackageSalesContextService,
  ) {}
  @Get('conversations/:id/sales-workflow')
  read(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.workflow.read(user.sub, id);
  }
  @Patch('conversations/:id/sales-workflow')
  status(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: CrmSalesStatusDto,
  ) {
    return this.workflow.setStatus(user.sub, id, input);
  }
  @Post('conversations/:id/follow-up')
  async schedule(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: CrmScheduleFollowUpDto,
  ) {
    await this.followUps.schedule(user.sub, id, input);
    return this.workflow.read(user.sub, id);
  }
  @Patch('conversations/:id/follow-up/:taskId')
  async followUp(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() input: CrmFollowUpActionDto,
  ) {
    await this.followUps.act(user.sub, id, taskId, input);
    return this.workflow.read(user.sub, id);
  }
  @Get('contacts/:id/purchases')
  history(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: CrmSalesContextQueryDto,
  ) {
    return this.purchases.list(user.sub, id, query);
  }
  @Get('package-sales-context')
  catalog(
    @CurrentUser() user: JwtUser,
    @Query() query: CrmSalesContextQueryDto,
  ) {
    return this.packages.list(user.sub, query);
  }
}
