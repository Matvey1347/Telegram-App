import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  CreateTelegramAdvertiserActivityDto,
  CreateTelegramAdvertiserContactDto,
  CreateTelegramAdvertiserDto,
  CreateTelegramAdvertiserTaskDto,
  TelegramAdvertiserActivitiesQueryDto,
  TelegramAdvertiserSearchDto,
  TelegramAdvertiserTasksQueryDto,
  TelegramAdvertisersQueryDto,
  TelegramAdCrmMemberSettingsDto,
  TelegramAdCrmWorkspaceSettingsDto,
  CompleteTelegramAdvertiserTaskDto,
  SkipTelegramAdvertiserTaskDto,
  UpdateTelegramAdvertiserContactDto,
  UpdateTelegramAdvertiserDto,
  UpdateTelegramAdvertiserTaskDto,
} from './dto';
import { TelegramAdSalesCrmAdvertisersService } from './telegram-ad-sales-crm-advertisers.service';
import { TelegramAdSalesCrmSettingsService } from './telegram-ad-sales-crm-settings.service';
import { TelegramAdSalesLegacyCrmService } from './telegram-ad-sales-legacy-crm.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-ad-sales')
export class TelegramAdSalesCrmController {
  constructor(
    private readonly crmAdvertisersService: TelegramAdSalesCrmAdvertisersService,
    private readonly crmSettingsService: TelegramAdSalesCrmSettingsService,
    private readonly legacyCrmService: TelegramAdSalesLegacyCrmService,
  ) {}

  @Get('advertisers')
  listAdvertisers(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdvertisersQueryDto,
  ) {
    return this.legacyCrmService.listAdvertisers(user.sub, query);
  }

  @Get('advertisers/search')
  advertiserSearch(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdvertiserSearchDto,
  ) {
    return this.legacyCrmService.advertiserSearch(user.sub, query);
  }

  @Get('advertisers/:id')
  getAdvertiser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.legacyCrmService.getAdvertiserDetails(user.sub, id);
  }

  @Post('advertisers')
  createAdvertiser(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramAdvertiserDto,
  ) {
    return this.legacyCrmService.createAdvertiser(user.sub, dto);
  }

  @Patch('advertisers/:id')
  updateAdvertiser(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramAdvertiserDto,
  ) {
    return this.legacyCrmService.updateAdvertiser(user.sub, id, dto);
  }

  @Post('advertisers/:id/archive')
  archiveAdvertiser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.legacyCrmService.archiveAdvertiser(user.sub, id);
  }

  @Post('advertisers/:id/restore')
  restoreAdvertiser(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.legacyCrmService.restoreAdvertiser(user.sub, id);
  }

  @Post('advertisers/:id/contacts')
  addAdvertiserContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdvertiserContactDto,
  ) {
    return this.legacyCrmService.addAdvertiserContact(user.sub, id, dto);
  }

  @Patch('advertisers/:id/contacts/:contactId')
  updateAdvertiserContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateTelegramAdvertiserContactDto,
  ) {
    return this.legacyCrmService.updateAdvertiserContact(
      user.sub,
      id,
      contactId,
      dto,
    );
  }

  @Delete('advertisers/:id/contacts/:contactId')
  deleteAdvertiserContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.legacyCrmService.deleteAdvertiserContact(
      user.sub,
      id,
      contactId,
    );
  }

  @Post('advertisers/:id/contacts/:contactId/set-primary')
  setPrimaryAdvertiserContact(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ) {
    return this.legacyCrmService.setPrimaryAdvertiserContact(
      user.sub,
      id,
      contactId,
    );
  }

  @Get('advertisers/:id/activities')
  listAdvertiserActivities(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: TelegramAdvertiserActivitiesQueryDto,
  ) {
    return this.legacyCrmService.listAdvertiserActivities(user.sub, id, query);
  }

  @Post('advertisers/:id/activities')
  createAdvertiserActivity(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdvertiserActivityDto,
  ) {
    return this.legacyCrmService.createAdvertiserActivityEntry(
      user.sub,
      id,
      dto,
    );
  }

  @Post('advertisers/:id/notes')
  createAdvertiserNote(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdvertiserActivityDto,
  ) {
    return this.legacyCrmService.createAdvertiserNote(user.sub, id, dto);
  }

  @Get('crm/tasks')
  listCrmTasks(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdvertiserTasksQueryDto,
  ) {
    return this.legacyCrmService.listCrmTasks(user.sub, query);
  }

  @Get('crm/advertisers')
  listCrmAdvertisers(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdvertisersQueryDto,
  ) {
    return this.crmAdvertisersService.listCrmAdvertisers(user.sub, query);
  }

  @Post('advertisers/:id/tasks')
  createAdvertiserTask(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateTelegramAdvertiserTaskDto,
  ) {
    return this.legacyCrmService.createAdvertiserTask(user.sub, id, dto);
  }

  @Patch('crm/tasks/:taskId')
  updateCrmTask(
    @CurrentUser() user: JwtUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    return this.legacyCrmService.updateCrmTask(user.sub, taskId, dto);
  }

  @Post('crm/tasks/:taskId/complete')
  completeCrmTask(
    @CurrentUser() user: JwtUser,
    @Param('taskId') taskId: string,
    @Body() dto: CompleteTelegramAdvertiserTaskDto,
  ) {
    return this.legacyCrmService.completeCrmTask(user.sub, taskId, dto);
  }

  @Post('crm/tasks/:taskId/snooze')
  snoozeCrmTask(
    @CurrentUser() user: JwtUser,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTelegramAdvertiserTaskDto,
  ) {
    return this.legacyCrmService.snoozeCrmTask(user.sub, taskId, dto);
  }

  @Post('crm/tasks/:taskId/skip')
  skipCrmTask(
    @CurrentUser() user: JwtUser,
    @Param('taskId') taskId: string,
    @Body() dto: SkipTelegramAdvertiserTaskDto,
  ) {
    return this.legacyCrmService.skipCrmTask(user.sub, taskId, dto);
  }

  @Get('crm/settings/workspace')
  getCrmWorkspaceSettings(@CurrentUser() user: JwtUser) {
    return this.crmSettingsService.getCrmWorkspaceSettings(user.sub);
  }

  @Put('crm/settings/workspace')
  updateCrmWorkspaceSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdCrmWorkspaceSettingsDto,
  ) {
    return this.crmSettingsService.updateCrmWorkspaceSettings(user.sub, dto);
  }

  @Get('crm/settings/member')
  getCrmMemberSettings(@CurrentUser() user: JwtUser) {
    return this.crmSettingsService.getCrmMemberSettings(user.sub);
  }

  @Put('crm/settings/member')
  updateCrmMemberSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdCrmMemberSettingsDto,
  ) {
    return this.crmSettingsService.updateCrmMemberSettings(user.sub, dto);
  }
}
