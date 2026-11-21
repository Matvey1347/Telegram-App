import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { WorkspaceRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../common/current-user.decorator';
import { ProductionRecoveryAdmission } from './production-recovery-admission';
import { WorkspaceService } from '../common/workspace.service';
import { StreamResponseService } from '../common/stream/stream-response.service';
import { productionRecoveryConfig } from '../config/production-recovery-config';
import { TelegramManagedPostReschedulerService } from '../domains/telegram/telegram-channels/telegram-managed-post-rescheduler.service';
import { TelegramManagedPostRecoverySnapshotService } from '../domains/telegram/telegram-channels/telegram-managed-post-recovery-snapshot.service';
import { TelegramManagedPostRescheduleBatchDto } from '../domains/telegram/telegram-channels/telegram-managed-post-reschedule-batch.dto';

import {
  CreateTelegramManagedPostDto,
  ManagedPostsCalendarQueryDto,
  TelegramManagedPostsQueryDto,
  PostGroupsQueryDto,
  UpdateTelegramManagedPostDto,
} from '../domains/telegram/telegram-channels/dto';
import { TelegramManagedPostCommandService } from '../domains/telegram/telegram-channels/telegram-managed-post-command.service';
import { TelegramManagedPostHistoryService } from '../domains/telegram/telegram-channels/telegram-managed-post-history.service';

import { TelegramManagedPostCalendarService } from '../domains/telegram/telegram-channels/telegram-managed-post-calendar.service';
import { TelegramManagedPostQueryService } from '../domains/telegram/telegram-channels/telegram-managed-post-query.service';
import { TelegramPostGroupsService } from '../domains/telegram/telegram-channels/telegram-post-groups.service';

import { TelegramPostGroupSummaryReadService } from '../domains/telegram/telegram-channels/telegram-post-group-summary-read.service';
import { TelegramChannelCatalogService } from '../domains/telegram/telegram-channels/telegram-channel-catalog.service';
import { ProductionOperatorPublicationService, requireOperatorRevision } from './production-operator-publication.service';

import { TelegramSourceAccessService } from '../telegram/shared/imports/telegram-source-access.service';

/** Local development entry point; only the selected channel can be mutated. */
@UseGuards(ProductionRecoveryAdmission)
@Controller()
export class ProductionRecoveryController {
  constructor(
    private readonly rescheduler: TelegramManagedPostReschedulerService,
    private readonly snapshot: TelegramManagedPostRecoverySnapshotService,
    private readonly streams: StreamResponseService,
    private readonly workspace: WorkspaceService,
    private readonly commands: TelegramManagedPostCommandService,
    private readonly history: TelegramManagedPostHistoryService,
    private readonly posts: TelegramManagedPostQueryService,
    private readonly calendar: TelegramManagedPostCalendarService,
    private readonly groups: TelegramPostGroupsService,
    private readonly postGroupSummaries: TelegramPostGroupSummaryReadService,
    private readonly catalog: TelegramChannelCatalogService,
    private readonly publication: ProductionOperatorPublicationService,
    private readonly sourceAccess: TelegramSourceAccessService,
  ) {}

  private async requireScope(userId: string, channelId?: string) {
    const config = productionRecoveryConfig();
    const { workspaceId } = await this.workspace.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
    ]);
    if (
      userId !== config.userId ||
      workspaceId !== config.workspaceId ||
      (channelId !== undefined && channelId !== config.channelId)
    ) {
      throw new ForbiddenException('Outside the selected recovery scope');
    }
  }

  @Get('telegram-channels/post-groups')
  async postGroups(@CurrentUser() user: JwtUser, @Query() query: PostGroupsQueryDto) {
    await this.requireScope(user.sub, query.telegramChannelId);
    if (!query.telegramChannelId) throw new ForbiddenException('Select the configured channel');
    return this.groups.postGroups(user.sub, query);
  }

  @Get('telegram-channels/:id')
  async channel(@CurrentUser() user: JwtUser, @Param('id') channelId: string) {
    await this.requireScope(user.sub, channelId);
    const [channel, publishingCapabilities] = await Promise.all([
      this.catalog.findOne(user.sub, channelId),
      this.sourceAccess.publishingCapabilitiesForChannel(productionRecoveryConfig().workspaceId, channelId),
    ]);
    return { ...channel, publishingCapabilities };
  }

  @Get('telegram-channels/:id/post-group-summaries')
  async groupSummaries(@CurrentUser() user: JwtUser, @Param('id') channelId: string) {
    await this.requireScope(user.sub, channelId);
    return this.postGroupSummaries.summaries(user.sub, channelId);
  }

  @Get('telegram-channels/:id/managed-posts')
  async managedPosts(@CurrentUser() user: JwtUser, @Param('id') channelId: string, @Query() query: TelegramManagedPostsQueryDto) {
    await this.requireScope(user.sub, channelId);
    return this.posts.managedPosts(user.sub, channelId, query);
  }

  @Get('telegram-channels/:id/managed-posts/calendar')
  async managedPostsCalendar(@CurrentUser() user: JwtUser, @Param('id') channelId: string, @Query() query: ManagedPostsCalendarQueryDto) {
    await this.requireScope(user.sub, channelId);
    return this.calendar.managedPostsCalendar(user.sub, channelId, query, { authoritative: true });
  }

  @Get('telegram-channels/:id/managed-posts/:postId')
  async managedPost(@CurrentUser() user: JwtUser, @Param('id') channelId: string, @Param('postId') postId: string) {
    await this.requireScope(user.sub, channelId);
    return this.posts.managedPost(user.sub, channelId, postId);
  }

  @Get('telegram-channels/:id/managed-posts/:postId/history')
  async managedPostHistory(@CurrentUser() user: JwtUser, @Param('id') channelId: string, @Param('postId') postId: string) {
    await this.requireScope(user.sub, channelId);
    return this.history.managedPostHistory(user.sub, channelId, postId);
  }

  @Post('telegram-channels/:id/managed-posts')
  async createDraft(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Body() body: CreateTelegramManagedPostDto,
  ) {
    await this.requireScope(user.sub, channelId);
    return this.commands.createManagedPost(user.sub, channelId, body);
  }

  @Patch('telegram-channels/:id/managed-posts/:postId')
  async updateDraft(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Param('postId') postId: string,
    @Body() body: UpdateTelegramManagedPostDto,
    @Headers('x-operator-revision') expected: string | undefined,
  ) {
    await this.requireScope(user.sub, channelId);
    const { revision } = await this.publication.postRevision(postId);
    requireOperatorRevision(expected, revision);
    const placementId = await this.publication.selectedPlacementForPost(postId);
    if (placementId && Object.keys(body).some((key) => !['title', 'text', 'imageUrls', 'mediaItems', 'buttonRows', 'inPlaceOnly'].includes(key)))
      throw new BadRequestException('Only content edits are supported for the selected placement draft');
    return this.history.updateManagedPost(user.sub, channelId, postId, body, {
      draftOnly: true, expectedRevision: new Date(revision), placementId,
      saleId: productionRecoveryConfig().saleId,
    });
  }

  @Get('telegram-channels/:id/reschedule-managed-posts-plan')
  async plan(@CurrentUser() user: JwtUser, @Param('id') channelId: string) {
    await this.requireScope(user.sub, channelId);
    return this.rescheduler.listChannelRescheduleCandidates(
      user.sub,
      channelId,
    );
  }

  @Get('telegram-channels/:id/recovery-managed-posts-snapshot')
  async readSnapshot(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
  ) {
    await this.requireScope(user.sub, channelId);
    return this.snapshot.snapshot(user.sub, channelId);
  }

  @Post('telegram-channels/:id/managed-posts/reschedule-all-stream')
  async reschedule(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Body() body: TelegramManagedPostRescheduleBatchDto,
    @Res() response: Response,
  ) {
    await this.requireScope(user.sub, channelId);
    if (
      !body.postIds?.length ||
      new Set(body.postIds).size !== body.postIds.length
    ) {
      throw new BadRequestException('Select the exact posts to recover');
    }
    return this.streams.stream(response, {
      eventPrefix: 'telegram_channel.managed_posts_reschedule_all',
      persistLifecycleLogs: false,
      heartbeatIntervalMs: 15_000,
      action: (onProgress) =>
        this.rescheduler.rescheduleChannelScheduledPosts(
          user.sub,
          channelId,
          onProgress,
          body.postIds,
        ),
    });
  }
}
