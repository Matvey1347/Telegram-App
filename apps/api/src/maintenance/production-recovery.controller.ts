import {
  All,
  Body,
  Controller,
  ForbiddenException,
  Get,
  MethodNotAllowedException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, type JwtUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WorkspaceService } from '../common/workspace.service';
import { StreamResponseService } from '../common/stream/stream-response.service';
import { productionRecoveryConfig } from '../config/production-recovery-config';
import { TelegramManagedPostReschedulerService } from '../domains/telegram/telegram-channels/telegram-managed-post-rescheduler.service';
import { TelegramManagedPostRecoverySnapshotService } from '../domains/telegram/telegram-channels/telegram-managed-post-recovery-snapshot.service';
import { TelegramManagedPostRescheduleBatchDto } from '../domains/telegram/telegram-channels/telegram-managed-post-reschedule-batch.dto';

/** Local development entry point; only the selected channel can be mutated. */
@UseGuards(JwtAuthGuard)
@Controller()
export class ProductionRecoveryController {
  constructor(
    private readonly rescheduler: TelegramManagedPostReschedulerService,
    private readonly snapshot: TelegramManagedPostRecoverySnapshotService,
    private readonly streams: StreamResponseService,
    private readonly workspace: WorkspaceService,
  ) {}

  private async requireScope(userId: string, channelId?: string) {
    const config = productionRecoveryConfig();
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    if (
      workspaceId !== config.workspaceId ||
      (channelId !== undefined && channelId !== config.channelId)
    ) {
      throw new ForbiddenException('Outside the selected recovery scope');
    }
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

  @All('*path')
  async readOnlyFallback(
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (request.method !== 'GET') {
      throw new MethodNotAllowedException(
        'This development host only permits the scoped recovery action',
      );
    }
    await this.requireScope(user.sub);
    const config = productionRecoveryConfig();
    const upstream = new URL(request.originalUrl, config.productionApiOrigin);
    if (
      upstream.origin !== new URL(config.productionApiOrigin).origin ||
      !upstream.pathname.startsWith('/api/')
    ) {
      throw new ForbiddenException('Invalid production API read path');
    }
    const result = await fetch(upstream, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        Authorization: request.headers.authorization!,
        'X-Workspace-Id': config.workspaceId,
        Accept: request.headers.accept ?? 'application/json',
      },
      signal: AbortSignal.timeout(60_000),
    });
    response.status(result.status);
    response.setHeader('Cache-Control', 'no-store');
    const contentType = result.headers.get('content-type');
    if (contentType) response.setHeader('Content-Type', contentType);
    response.end(Buffer.from(await result.arrayBuffer()));
  }
}
