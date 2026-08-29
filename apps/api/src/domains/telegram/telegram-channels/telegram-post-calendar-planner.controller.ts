import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { StreamResponseService } from '../../../common/stream/stream-response.service';
import {
  CreatePostPlannerFormatDto,
  CreatePostPlannerSlotDto,
  PostPlannerApplyDto,
  PostPlannerPreviewDto,
  PostPlannerRerollDayDto,
  PostPlannerSlotBatchDto,
  UpdatePostPlannerFormatDto,
  UpdatePostPlannerSlotDto,
} from './dto';
import { TelegramPostCalendarPlannerService } from './telegram-post-calendar-planner.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels/:id/managed-posts/calendar-planner')
export class TelegramPostCalendarPlannerController {
  constructor(
    private readonly planner: TelegramPostCalendarPlannerService,
    private readonly streamResponse: StreamResponseService,
  ) {}

  @Get('formats')
  listFormats(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.planner.listFormats(user.sub, id);
  }

  @Post('formats')
  createFormat(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreatePostPlannerFormatDto,
  ) {
    return this.planner.createFormat(user.sub, id, dto);
  }

  @Patch('formats/:formatId')
  updateFormat(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('formatId') formatId: string,
    @Body() dto: UpdatePostPlannerFormatDto,
  ) {
    return this.planner.updateFormat(user.sub, id, formatId, dto);
  }

  @Delete('formats/:formatId')
  deleteFormat(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('formatId') formatId: string,
  ) {
    return this.planner.deleteFormat(user.sub, id, formatId);
  }

  @Get('slots')
  listSlots(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.planner.listSlots(user.sub, id);
  }

  @Post('slots')
  createSlot(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreatePostPlannerSlotDto,
  ) {
    return this.planner.createSlot(user.sub, id, dto);
  }

  @Patch('slots/:slotId')
  updateSlot(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('slotId') slotId: string,
    @Body() dto: UpdatePostPlannerSlotDto,
  ) {
    return this.planner.updateSlot(user.sub, id, slotId, dto);
  }

  @Delete('slots/:slotId')
  deleteSlot(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('slotId') slotId: string,
  ) {
    return this.planner.deleteSlot(user.sub, id, slotId);
  }

  @Post('slots/batch-stream')
  mutateSlotsBatch(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: PostPlannerSlotBatchDto,
    @Res() response: Response,
  ) {
    return this.streamResponse.stream(response, {
      eventPrefix: 'telegram_channel.post_planner_slots_batch_stream',
      action: (onProgress) =>
        this.planner.mutateSlotsBatch(user.sub, id, dto, onProgress),
    });
  }

  @Post('preview')
  preview(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: PostPlannerPreviewDto,
  ) {
    return this.planner.preview(user.sub, id, dto);
  }

  @Post('apply')
  apply(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: PostPlannerApplyDto,
  ) {
    return this.planner.apply(user.sub, id, dto);
  }

  @Post('reroll-day')
  rerollDay(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: PostPlannerRerollDayDto,
  ) {
    return this.planner.rerollDay(user.sub, id, dto);
  }
}
