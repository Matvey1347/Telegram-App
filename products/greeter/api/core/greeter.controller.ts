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
import {
  CurrentUser,
  type JwtUser,
} from '../../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/jwt-auth.guard';
import { GreeterAnalyticsService } from './greeter-analytics.service';
import { GreeterAutomationService } from './greeter-automation.service';
import { GreeterBroadcastService } from './greeter-broadcast.service';
import { GreeterConfigurationService } from './greeter-configuration.service';
import { GreeterTestModeService } from './greeter-test-mode.service';
import {
  EnableGreeterTestModeDto,
  GreeterAnalyticsQueryDto,
  GreeterBroadcastDto,
  GreeterChannelDto,
  GreeterChannelOverrideDto,
  GreeterConfigDto,
  GreeterPreviewContextDto,
  GreeterSequenceDto,
  GreeterTemplatePreviewDto,
  GreeterUsersQueryDto,
  PublishGreeterConfigDto,
  PublishGreeterSequenceDto,
  ReplaceGreeterDraftDto,
  ResolveGreeterTestUserDto,
  ScheduleGreeterBroadcastDto,
  SelectGreeterTesterDto,
  UpdateGreeterSequenceDto,
} from './greeter.dto';

@UseGuards(JwtAuthGuard)
@Controller('telegram-bots/:botId/greeter')
export class GreeterController {
  constructor(
    private readonly configuration: GreeterConfigurationService,
    private readonly analyticsService: GreeterAnalyticsService,
    private readonly automations: GreeterAutomationService,
    private readonly broadcasts: GreeterBroadcastService,
    private readonly testMode: GreeterTestModeService,
  ) {}

  @Get()
  overview(@CurrentUser() user: JwtUser, @Param('botId') botId: string) {
    return this.configuration.overview(user.sub, botId);
  }

  @Patch('config')
  async updateConfig(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Body() dto: GreeterConfigDto,
  ) {
    await this.configuration.updateConfig(user.sub, botId, dto);
    return this.configuration.overview(user.sub, botId);
  }

  @Post('config/publish')
  publishConfig(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Body() dto: PublishGreeterConfigDto,
  ) {
    return this.configuration.publishConfig(user.sub, botId, dto.draftRevision);
  }

  @Get('test-mode')
  testModeStatus(@CurrentUser() user: JwtUser, @Param('botId') botId: string) {
    return this.testMode.get(user.sub, botId);
  }

  @Post('test-mode/resolve')
  resolveTestUser(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Body() dto: ResolveGreeterTestUserDto,
  ) {
    return this.testMode.resolve(user.sub, botId, dto.username);
  }

  @Put('test-mode')
  enableTestMode(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Body() dto: EnableGreeterTestModeDto,
  ) {
    return this.testMode.enable(user.sub, botId, dto);
  }

  @Post('test-mode/reset')
  resetFullTestMode(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
  ) {
    return this.testMode.reset(user.sub, botId);
  }

  @Delete('test-mode')
  disableFullTestMode(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
  ) {
    return this.testMode.disable(user.sub, botId);
  }

  @Post('preview')
  preview(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Body() dto: GreeterTemplatePreviewDto,
  ) {
    return this.configuration.previewTemplate(user.sub, botId, {
      template: dto.messageText,
      buttons: dto.buttons as never,
      context: {
        channelId: dto.channelId,
        telegramBotUserId: dto.telegramBotUserId,
      },
    });
  }

  @Get('channels')
  async channels(@CurrentUser() user: JwtUser, @Param('botId') botId: string) {
    return (await this.configuration.overview(user.sub, botId)).channels;
  }

  @Post('channels')
  async connectChannel(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Body() dto: GreeterChannelDto,
  ) {
    const connected = await this.configuration.connectChannel(
      user.sub,
      botId,
      dto.channelId,
    );
    const overview = await this.configuration.overview(user.sub, botId);
    return overview.channels.find((item) => item.id === connected.id);
  }

  @Patch('channels/:channelId')
  async updateChannel(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('channelId') channelId: string,
    @Body() dto: GreeterChannelOverrideDto,
  ) {
    await this.configuration.updateChannel(user.sub, botId, channelId, dto);
    const overview = await this.configuration.overview(user.sub, botId);
    return overview.channels.find((item) => item.id === channelId);
  }

  @Delete('channels/:channelId')
  deleteChannel(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('channelId') channelId: string,
  ) {
    return this.configuration.deleteChannel(user.sub, botId, channelId);
  }

  @Post('channels/:channelId/permissions/refresh')
  async refreshChannel(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('channelId') channelId: string,
  ) {
    await this.configuration.refreshChannelPermissions(
      user.sub,
      botId,
      channelId,
    );
    const overview = await this.configuration.overview(user.sub, botId);
    return overview.channels.find((item) => item.id === channelId);
  }

  @Get('users')
  users(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Query() query: GreeterUsersQueryDto,
  ) {
    return this.analyticsService.users(user.sub, botId, query as never);
  }

  @Get('analytics')
  analytics(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Query() query: GreeterAnalyticsQueryDto,
  ) {
    return this.analyticsService.analytics(user.sub, botId, query);
  }

  @Get('automations')
  sequences(@CurrentUser() user: JwtUser, @Param('botId') botId: string) {
    return this.automations.listSequences(user.sub, botId);
  }

  @Post('automations')
  async createSequence(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Body() dto: GreeterSequenceDto,
  ) {
    const created = await this.automations.createSequence(user.sub, botId, dto);
    return this.automations.sequenceDetail(user.sub, botId, created.id);
  }

  @Get('automations/:sequenceId')
  sequence(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    return this.automations.sequenceDetail(user.sub, botId, sequenceId);
  }

  @Patch('automations/:sequenceId')
  async updateSequence(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
    @Body() dto: UpdateGreeterSequenceDto,
  ) {
    await this.automations.updateSequence(user.sub, botId, sequenceId, dto);
    return this.automations.sequenceDetail(user.sub, botId, sequenceId);
  }

  @Put('automations/:sequenceId/draft')
  replaceDraft(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
    @Body() dto: ReplaceGreeterDraftDto,
  ) {
    return this.automations.replaceDraftSteps(
      user.sub,
      botId,
      sequenceId,
      dto.steps,
      dto.draftRevision,
    );
  }

  @Post('automations/:sequenceId/publish')
  publish(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
    @Body() dto: PublishGreeterSequenceDto,
  ) {
    return this.automations.publish(
      user.sub,
      botId,
      sequenceId,
      dto.draftRevision,
    );
  }

  @Get('automations/:sequenceId/versions/:versionId')
  version(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.automations.versionDetail(
      user.sub,
      botId,
      sequenceId,
      versionId,
    );
  }

  @Post('automations/:sequenceId/preview')
  async previewSequence(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
    @Body() dto: GreeterPreviewContextDto,
  ) {
    const sequence = await this.automations.sequenceDetail(
      user.sub,
      botId,
      sequenceId,
    );
    return Promise.all(
      sequence.draftSteps.map((step) =>
        this.automations.preview(user.sub, botId, {
          messageText: step.messageText,
          buttons: step.buttons,
          channelId: dto.channelId,
          telegramBotUserId: dto.telegramBotUserId,
        }),
      ),
    );
  }

  @Get('testers')
  testers(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Query('search') search?: string,
  ) {
    return this.automations.lookupTesters(user.sub, botId, search);
  }

  @Put('automations/:sequenceId/tester')
  selectTester(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
    @Body() dto: SelectGreeterTesterDto,
  ) {
    return this.automations.selectTester(user.sub, botId, sequenceId, dto);
  }

  @Delete('automations/:sequenceId/tester')
  disableTester(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    return this.automations.disableTester(user.sub, botId, sequenceId);
  }

  @Post('automations/:sequenceId/test/run')
  runTest(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    return this.automations.runTest(user.sub, botId, sequenceId);
  }

  @Post('automations/:sequenceId/test/reset')
  resetTest(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('sequenceId') sequenceId: string,
  ) {
    return this.automations.resetTest(user.sub, botId, sequenceId);
  }

  @Get('broadcasts')
  broadcastsList(@CurrentUser() user: JwtUser, @Param('botId') botId: string) {
    return this.broadcasts.list(user.sub, botId);
  }

  @Post('broadcasts')
  createBroadcast(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Body() dto: GreeterBroadcastDto,
  ) {
    return this.broadcasts.create(user.sub, botId, dto);
  }

  @Get('broadcasts/:broadcastId')
  broadcast(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('broadcastId') broadcastId: string,
  ) {
    return this.broadcasts.detail(user.sub, botId, broadcastId);
  }

  @Patch('broadcasts/:broadcastId')
  updateBroadcast(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('broadcastId') broadcastId: string,
    @Body() dto: GreeterBroadcastDto,
  ) {
    return this.broadcasts.update(user.sub, botId, broadcastId, dto);
  }

  @Post('broadcasts/:broadcastId/estimate')
  estimateBroadcast(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('broadcastId') broadcastId: string,
  ) {
    return this.broadcasts.estimate(user.sub, botId, broadcastId);
  }

  @Post('broadcasts/:broadcastId/send-now')
  sendBroadcast(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('broadcastId') broadcastId: string,
  ) {
    return this.broadcasts.sendNow(user.sub, botId, broadcastId);
  }

  @Post('broadcasts/:broadcastId/schedule')
  scheduleBroadcast(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('broadcastId') broadcastId: string,
    @Body() dto: ScheduleGreeterBroadcastDto,
  ) {
    return this.broadcasts.schedule(
      user.sub,
      botId,
      broadcastId,
      new Date(dto.scheduledAt),
    );
  }

  @Post('broadcasts/:broadcastId/cancel')
  cancelBroadcast(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('broadcastId') broadcastId: string,
  ) {
    return this.broadcasts.cancel(user.sub, botId, broadcastId);
  }
}
