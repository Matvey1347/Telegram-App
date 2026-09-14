import {
  Controller,
  Get,
  Header,
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
import { TelegramSystemBotPostBatchFlowService } from './telegram-system-bot-post-batch-flow.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram/system-bot/post-batch-import')
export class TelegramSystemBotPostBatchController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly connections: TelegramSystemBotConnectionsService,
    private readonly flow: TelegramSystemBotPostBatchFlowService,
  ) {}

  @Post()
  async prepare(@CurrentUser() user: JwtUser) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    await this.connections.switchWorkspaceForUser(user.sub, workspaceId);
    const scope = await this.connections.workflowScopeForUser(
      user.sub,
      workspaceId,
    );
    return this.flow.prepare({ ...scope, timezone: 'UTC' });
  }

  @Get()
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  async result(
    @CurrentUser() user: JwtUser,
    @Query('workflowId') workflowId: string,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    const scope = await this.connections.workflowScopeForUser(
      user.sub,
      workspaceId,
    );
    return this.flow.result({ ...scope, timezone: 'UTC' }, workflowId);
  }
}
