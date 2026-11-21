import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WorkspaceRole } from '@prisma/client';
import { CurrentUser, type JwtUser } from '../common/current-user.decorator';
import { WorkspaceService } from '../common/workspace.service';
import { StreamResponseService } from '../common/stream/stream-response.service';
import { productionRecoveryConfig } from '../config/production-recovery-config';
import { PublishTelegramManagedPostDto } from '../domains/telegram/telegram-channels/dto';
import { ProductionRecoveryAdmission } from './production-recovery-admission';
import { ProductionOperatorPublicationService } from './production-operator-publication.service';

@UseGuards(ProductionRecoveryAdmission)
@Controller()
export class ProductionOperatorPublicationController {
  constructor(
    private readonly publication: ProductionOperatorPublicationService,
    private readonly workspace: WorkspaceService,
    private readonly streams: StreamResponseService,
  ) {}

  private async scope(userId: string, channelId = productionRecoveryConfig().channelId) {
    const config = productionRecoveryConfig();
    const { workspaceId } = await this.workspace.requireWorkspaceRole(userId, [WorkspaceRole.owner]);
    if (userId !== config.userId || workspaceId !== config.workspaceId || channelId !== config.channelId)
      throw new ForbiddenException('Outside the configured production scope');
  }

  private async untilDisconnect<T>(response: Response, action: (signal: AbortSignal) => Promise<T>) {
    const cancellation = new AbortController();
    const abort = () => cancellation.abort();
    response.once('close', abort);
    try {
      return await action(cancellation.signal);
    } finally {
      response.removeListener('close', abort);
    }
  }

  @Get('telegram-channels/:channel/managed-posts/:post/operator-revision')
  async postRevision(@CurrentUser() user: JwtUser, @Param('channel') channel: string, @Param('post') post: string) {
    await this.scope(user.sub, channel);
    return this.publication.postRevision(post);
  }

  @Post(['telegram-channels/:channel/managed-posts/:post/publish', 'telegram-channels/:channel/managed-posts/:post/reconcile-published'])
  async publishPost(
    @CurrentUser() user: JwtUser, @Param('channel') channel: string, @Param('post') post: string,
    @Headers('x-operator-revision') revision: string | undefined,
    @Req() request: Request, @Body() body: PublishTelegramManagedPostDto, @Res({ passthrough: true }) response: Response,
  ) {
    await this.scope(user.sub, channel);
    return this.untilDisconnect(response, (signal) => this.publication.publishPost(user.sub, post, revision, body, signal, request.path.endsWith('/reconcile-published')));
  }

  @Post('telegram-channels/:channel/managed-posts/:post/publish-stream')
  async publishPostStream(
    @CurrentUser() user: JwtUser, @Param('channel') channel: string, @Param('post') post: string,
    @Headers('x-operator-revision') revision: string | undefined,
    @Body() body: PublishTelegramManagedPostDto, @Res() response: Response,
  ) {
    await this.scope(user.sub, channel);
    return this.untilDisconnect(response, (signal) => this.streams.stream(response, {
      eventPrefix: 'telegram_channel.managed_post_publish_stream', persistLifecycleLogs: false,
      action: () => this.publication.publishPost(user.sub, post, revision, body, signal),
    }));
  }

  @Get('telegram-ad-sales/:sale/placements/:placement/operator-revision')
  async placementRevision(@CurrentUser() user: JwtUser, @Param('sale') sale: string, @Param('placement') placement: string) {
    await this.scope(user.sub);
    return this.publication.placementRevision(sale, placement);
  }

  @Post('telegram-ad-sales/:sale/placements/:placement/:action')
  async publishPlacement(
    @CurrentUser() user: JwtUser, @Param('sale') sale: string,
    @Param('placement') placement: string, @Param('action') action: string,
    @Headers('x-operator-revision') revision: string | undefined,
    @Body() body: PublishTelegramManagedPostDto, @Res({ passthrough: true }) response: Response,
  ) {
    await this.scope(user.sub);
    if (action !== 'publish' && action !== 'reconcile-published')
      throw new ForbiddenException('This placement action is outside the operator publication scope');
    return this.untilDisconnect(response, (signal) =>
      this.publication.publishPlacement(user.sub, sale, placement, revision, body, signal, action === 'reconcile-published'));
  }
}
