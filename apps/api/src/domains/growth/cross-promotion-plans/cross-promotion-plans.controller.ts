import {
  Body,
  Controller,
  Delete,
  Patch,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { CrossPromotionPlansService } from './cross-promotion-plans.service';
import {
  CreateCrossPromotionPlanDto,
  RenameCrossPromotionPlanDto,
} from './dto';
import { StreamResponseService } from '../../../common/stream/stream-response.service';
import { CrossPromotionPlanSchedulingService } from './cross-promotion-plan-scheduling.service';
import { CrossPromotionPlanBotNotificationService } from './cross-promotion-plan-bot-notification.service';

@UseGuards(JwtAuthGuard)
@Controller('cross-promotion-plans')
export class CrossPromotionPlansController {
  constructor(
    private readonly service: CrossPromotionPlansService,
    private readonly scheduling: CrossPromotionPlanSchedulingService,
    private readonly streamResponse: StreamResponseService,
    private readonly botNotification: CrossPromotionPlanBotNotificationService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query('kind') kind?: string) {
    return this.service.list(user.sub, kind);
  }

  @Post('schedule-stream')
  createAndSchedule(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateCrossPromotionPlanDto,
    @Res() res: Response,
  ) {
    return this.streamResponse.stream(res, {
      eventPrefix: 'cross_promotion_plan.schedule_stream',
      persistLifecycleLogs: false,
      action: (onProgress, signal) =>
        this.scheduling.createAndSchedule(user.sub, dto, onProgress, signal),
    });
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.scheduling.remove(user.sub, id);
  }

  @Patch(':id/title')
  rename(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: RenameCrossPromotionPlanDto,
  ) {
    return this.service.rename(user.sub, id, dto.title);
  }

  @Post(':id/refresh-invite-links')
  refreshInviteLinkData(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.refreshInviteLinkData(user.sub, id);
  }

  @Patch(':id')
  updateCompleted(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateCrossPromotionPlanDto,
  ) {
    return this.service.updateCompleted(user.sub, id, dto);
  }

  @Post(':id/schedule-stream')
  replaceAndSchedule(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateCrossPromotionPlanDto,
    @Res() res: Response,
  ) {
    return this.streamResponse.stream(res, {
      eventPrefix: 'cross_promotion_plan.reschedule_stream',
      persistLifecycleLogs: false,
      action: (onProgress, signal) =>
        this.scheduling.replaceAndSchedule(
          user.sub,
          id,
          dto,
          onProgress,
          signal,
        ),
    });
  }

  @Post(':id/resume-stream')
  resume(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.streamResponse.stream(res, {
      eventPrefix: 'cross_promotion_plan.resume_stream',
      persistLifecycleLogs: false,
      action: (onProgress, signal) =>
        this.scheduling.resume(user.sub, id, onProgress, signal),
    });
  }

  @Post(':id/send-to-bot')
  sendToBot(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.botNotification.send(user.sub, id);
  }
}
