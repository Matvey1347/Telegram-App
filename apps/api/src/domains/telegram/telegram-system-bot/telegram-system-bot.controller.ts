import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { WorkspaceService } from '../../../common/workspace.service';
import { TelegramSystemBotConnectionsService } from './telegram-system-bot-connections.service';
import { TelegramSystemBotHandlerService } from './telegram-system-bot-handler.service';
import { TelegramSystemBotRuntimeService } from './telegram-system-bot-runtime.service';
import type { TelegramSystemBotPostPreviewDraft } from './telegram-system-bot-post-flow.types';
import { TelegramSystemBotPostImportService } from './telegram-system-bot-post-import.service';
import type { TelegramSystemBotUpdate } from './telegram-system-bot-handler.service';
import {
  PrepareTelegramSystemBotPostImportDto,
  TelegramSystemBotSubscriptionsQueryDto,
  UpdateTelegramSystemBotGroupSubscriptionsDto,
  UpdateTelegramSystemBotSubscriptionDto,
} from './dto';

@Controller('telegram/system-bot')
export class TelegramSystemBotController {
  constructor(
    private readonly connections: TelegramSystemBotConnectionsService,
    private readonly runtime: TelegramSystemBotRuntimeService,
    private readonly handler: TelegramSystemBotHandlerService,
    private readonly postImports: TelegramSystemBotPostImportService,
    private readonly workspace: WorkspaceService,
  ) {}

  @Post('webhook')
  webhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: TelegramSystemBotUpdate,
  ) {
    return this.runtime.handleWebhook(secret, update);
  }

  @UseGuards(JwtAuthGuard)
  @Get('connection')
  connection(@CurrentUser() user: JwtUser) {
    return this.connections.status(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('connect/preview')
  preview(@CurrentUser() user: JwtUser, @Query('token') token: string) {
    return this.connections.previewLink(user.sub, token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('connect')
  async connect(@CurrentUser() user: JwtUser, @Body('token') token: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    const confirmed = await this.connections.confirmLink(
      user.sub,
      token,
      workspaceId,
    );
    await this.handler.completeConnection({
      chatId: confirmed.telegramChatId,
      messageId: confirmed.telegramMessageId,
      connectionId: confirmed.connectionId,
    });
    return confirmed.status;
  }

  @UseGuards(JwtAuthGuard)
  @Post('connection/workspace')
  async selectCurrentWorkspace(@CurrentUser() user: JwtUser) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    await this.connections.switchWorkspaceForUser(user.sub, workspaceId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('post-imports')
  async preparePostImport(
    @CurrentUser() user: JwtUser,
    @Body() dto: PrepareTelegramSystemBotPostImportDto,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    await this.connections.switchWorkspaceForUser(user.sub, workspaceId);
    const connection = await this.connections.workflowScopeForUser(
      user.sub,
      workspaceId,
    );
    return this.postImports.prepare(
      { ...connection, timezone: 'UTC' },
      dto.mode,
      {
        context: dto.context,
        replaceActive: dto.replaceActive,
      },
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('post-imports/:workflowId')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async postImportResult(
    @CurrentUser() user: JwtUser,
    @Param('workflowId') workflowId: string,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    const connection = await this.connections.workflowScopeForUser(
      user.sub,
      workspaceId,
    );
    return this.postImports.result(
      { ...connection, timezone: 'UTC' },
      workflowId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('post-imports/:workflowId')
  async cancelPostImport(
    @CurrentUser() user: JwtUser,
    @Param('workflowId') workflowId: string,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    const connection = await this.connections.workflowScopeForUser(
      user.sub,
      workspaceId,
    );
    return this.postImports.cancel(
      { ...connection, timezone: 'UTC' },
      workflowId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('post-preview')
  async sendPostPreview(
    @CurrentUser() user: JwtUser,
    @Body() draft: TelegramSystemBotPostPreviewDraft,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    const connection = await this.connections.workflowScopeForUser(
      user.sub,
      workspaceId,
    );
    return this.postImports.sendPreview(
      { ...connection, timezone: 'UTC' },
      draft,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('connection')
  disconnect(@CurrentUser() user: JwtUser) {
    return this.connections.disconnect(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions')
  updateSubscription(
    @CurrentUser() user: JwtUser,
    @Body() payload: UpdateTelegramSystemBotSubscriptionDto,
  ) {
    return this.connections.updateSubscription(user.sub, payload);
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions/group')
  updateGroupSubscriptions(
    @CurrentUser() user: JwtUser,
    @Body() payload: UpdateTelegramSystemBotGroupSubscriptionsDto,
  ) {
    return this.connections.updateGroupSubscriptions(user.sub, payload);
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscriptions')
  subscriptions(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramSystemBotSubscriptionsQueryDto,
  ) {
    return this.connections.subscriptions(user.sub, query.workspaceId);
  }
}
