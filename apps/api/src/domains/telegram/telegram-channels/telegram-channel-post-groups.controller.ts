import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  CreatePostGroupDto,
  ImportPostGroupsDto,
  MovePostChannelDto,
  PostGroupsQueryDto,
  PostIdsDto,
  PublishPostGroupDto,
  ReorderPostGroupDto,
  SchedulePostGroupSequenceDto,
  UpdatePostGroupDto,
} from './dto';
import { TelegramChannelsService } from './telegram-channels.service';
import { StreamResponseService } from '../../../common/stream/stream-response.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramChannelPostGroupsController {
  constructor(
    private service: TelegramChannelsService,
    private readonly streamResponse: StreamResponseService,
  ) {}

  private async streamBulkAction(
    res: Response,
    action: (
      onProgress: (item: unknown, current: number, total: number) => void,
      signal: AbortSignal,
    ) => Promise<unknown>,
    eventPrefix: string,
  ) {
    return this.streamResponse.stream(res, { eventPrefix, action });
  }

  @Get('post-groups')
  postGroups(@CurrentUser() user: JwtUser, @Query() query: PostGroupsQueryDto) {
    return this.service.postGroups(user.sub, query);
  }

  @Post('post-groups')
  createPostGroup(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreatePostGroupDto,
  ) {
    return this.service.createPostGroup(user.sub, dto);
  }

  @Post('post-groups/import-stream')
  importPostGroupsStream(
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportPostGroupsDto,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) => this.service.importPostGroups(user.sub, dto, onProgress),
      'telegram_channel.post_groups_import_stream',
    );
  }

  @Get('post-groups/:groupId')
  postGroup(@CurrentUser() user: JwtUser, @Param('groupId') groupId: string) {
    return this.service.postGroup(user.sub, groupId);
  }

  @Patch('post-groups/:groupId')
  updatePostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdatePostGroupDto,
  ) {
    return this.service.updatePostGroup(user.sub, groupId, dto);
  }

  @Delete('post-groups/:groupId')
  deletePostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
  ) {
    return this.service.deletePostGroup(user.sub, groupId);
  }

  @Post('post-groups/:groupId/posts')
  addPostsToGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: PostIdsDto,
  ) {
    return this.service.addPostsToGroup(user.sub, groupId, dto);
  }

  @Delete('post-groups/:groupId/posts/:postId')
  removePostFromGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Param('postId') postId: string,
  ) {
    return this.service.removePostFromGroup(user.sub, groupId, postId);
  }

  @Post('post-groups/:groupId/reorder')
  reorderPostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: ReorderPostGroupDto,
  ) {
    return this.service.reorderPostGroup(user.sub, groupId, dto);
  }

  @Post('post-groups/:groupId/move-channel')
  movePostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: MovePostChannelDto,
  ) {
    return this.service.movePostGroup(user.sub, groupId, dto);
  }

  @Post('post-groups/:groupId/move-channel-stream')
  movePostGroupStream(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: MovePostChannelDto,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.movePostGroup(user.sub, groupId, dto, onProgress),
      'telegram_channel.post_group_move_stream',
    );
  }

  @Post('post-groups/:groupId/publish-all')
  publishPostGroup(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: PublishPostGroupDto,
  ) {
    return this.service.publishPostGroup(user.sub, groupId, dto);
  }

  @Post('post-groups/:groupId/publish-all-stream')
  publishPostGroupStream(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: PublishPostGroupDto,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.publishPostGroup(user.sub, groupId, dto, onProgress),
      'telegram_channel.post_group_publish_stream',
    );
  }

  @Post('post-groups/:groupId/reset-drafts')
  resetPostGroupToDrafts(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
  ) {
    return this.service.resetPostGroupToDrafts(user.sub, groupId);
  }

  @Post('post-groups/:groupId/reset-drafts-stream')
  resetPostGroupToDraftsStream(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.resetPostGroupToDrafts(user.sub, groupId, onProgress),
      'telegram_channel.post_group_reset_stream',
    );
  }

  @Post('post-groups/:groupId/schedule-sequence')
  schedulePostGroupSequence(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: SchedulePostGroupSequenceDto,
  ) {
    return this.service.schedulePostGroupSequence(user.sub, groupId, dto);
  }

  @Post('post-groups/:groupId/schedule-sequence-stream')
  schedulePostGroupSequenceStream(
    @CurrentUser() user: JwtUser,
    @Param('groupId') groupId: string,
    @Body() dto: SchedulePostGroupSequenceDto,
    @Res() res: Response,
  ) {
    return this.streamBulkAction(
      res,
      (onProgress) =>
        this.service.schedulePostGroupSequence(
          user.sub,
          groupId,
          dto,
          onProgress,
        ),
      'telegram_channel.post_group_schedule_sequence_stream',
    );
  }
}
