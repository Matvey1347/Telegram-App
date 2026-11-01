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
import { TelegramCrmInstagramIdentityService } from './telegram-crm-instagram-identity.service';
import { TelegramCrmManualContactsReadService } from './telegram-crm-manual-contacts-read.service';
import { TelegramCrmManualContactsCommandService } from './telegram-crm-manual-contacts-command.service';
import { TelegramCrmManualActivityService } from './telegram-crm-manual-activity.service';
import { TelegramCrmManualFollowUpService } from './telegram-crm-manual-follow-up.service';
import {
  CrmInstagramMethodDto,
  CrmManualActivityDto,
  CrmManualActivityQueryDto,
  CrmManualContactCreateDto,
  CrmManualContactsQueryDto,
  CrmManualFollowUpDto,
} from './telegram-crm-manual-contacts.dto';
import { CrmFollowUpActionDto } from './telegram-crm-sales-workflow.dto';
@UseGuards(JwtAuthGuard)
@Controller('telegram-crm/manual-contacts')
export class TelegramCrmManualContactsController {
  constructor(
    private readonly reads: TelegramCrmManualContactsReadService,
    private readonly commands: TelegramCrmManualContactsCommandService,
    private readonly identities: TelegramCrmInstagramIdentityService,
    private readonly activities: TelegramCrmManualActivityService,
    private readonly followUps: TelegramCrmManualFollowUpService,
  ) {}
  @Get() list(
    @CurrentUser() user: JwtUser,
    @Query() query: CrmManualContactsQueryDto,
  ) {
    return this.reads.list(user.sub, query);
  }
  @Post() async create(
    @CurrentUser() user: JwtUser,
    @Body() input: CrmManualContactCreateDto,
  ) {
    return this.reads.workflow(
      user.sub,
      await this.commands.create(user.sub, input),
    );
  }
  @Get(':id/workflow') workflow(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: CrmManualActivityQueryDto,
  ) {
    return this.reads.workflow(user.sub, id, query);
  }
  @Post(':id/instagram') async add(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: CrmInstagramMethodDto,
  ) {
    await this.identities.write(user.sub, id, input);
    return this.reads.workflow(user.sub, id);
  }
  @Patch(':id/instagram/:methodId') async update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('methodId') methodId: string,
    @Body() input: CrmInstagramMethodDto,
  ) {
    await this.identities.write(user.sub, id, input, methodId);
    return this.reads.workflow(user.sub, id);
  }
  @Post(':id/activities') async activity(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: CrmManualActivityDto,
  ) {
    await this.activities.record(user.sub, id, input);
    return this.reads.workflow(user.sub, id);
  }
  @Post(':id/follow-up') async schedule(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: CrmManualFollowUpDto,
  ) {
    await this.followUps.schedule(user.sub, id, input);
    return this.reads.workflow(user.sub, id);
  }
  @Patch(':id/follow-up/:taskId') async act(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() input: CrmFollowUpActionDto,
  ) {
    await this.followUps.act(user.sub, id, taskId, input);
    return this.reads.workflow(user.sub, id);
  }
}
