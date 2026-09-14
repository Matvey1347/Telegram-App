import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { TelegramPostBatchCommandService } from './telegram-post-batch-command.service';
import {
  ImportTelegramPostBatchDto,
  DispatchTelegramPostBatchDto,
  LinkTelegramPostBatchDto,
  TelegramPostBatchDeliveriesQueryDto,
  TelegramPostBatchLinkTargetsQueryDto,
  TelegramPostBatchListQueryDto,
  UpdateTelegramPostBatchDto,
} from './telegram-post-batch.dto';
import { TelegramPostBatchReadService } from './telegram-post-batch-read.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-post-batches')
export class TelegramPostBatchesController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly read: TelegramPostBatchReadService,
    private readonly command: TelegramPostBatchCommandService,
  ) {}

  @Post('import')
  importWorkflow(
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportTelegramPostBatchDto,
  ) {
    return this.command.importWorkflow(user.sub, dto.workflowId);
  }

  @Get('link-targets')
  async linkTargets(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramPostBatchLinkTargetsQueryDto,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    return this.read.linkTargets(workspaceId, query.type);
  }

  @Get()
  async list(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramPostBatchListQueryDto,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    return this.read.list(workspaceId, query.page, query.pageSize);
  }

  @Get(':id')
  async get(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    return this.read.get(workspaceId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramPostBatchDto,
  ) {
    return this.command.update(user.sub, id, dto);
  }

  @Post(':id/dispatch')
  dispatch(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: DispatchTelegramPostBatchDto,
  ) {
    return this.command.dispatch(user.sub, id, dto.expectedVersion);
  }

  @Get(':id/deliveries')
  async deliveries(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: TelegramPostBatchDeliveriesQueryDto,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(
      user.sub,
    );
    return this.read.deliveries(workspaceId, id, query.page, query.pageSize);
  }

  @Post(':id/links')
  link(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: LinkTelegramPostBatchDto,
  ) {
    return this.command.link(user.sub, id, dto);
  }
}
