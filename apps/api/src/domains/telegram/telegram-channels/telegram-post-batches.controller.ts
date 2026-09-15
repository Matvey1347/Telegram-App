import {
  Body,
  Controller,
  Delete,
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
  ImportTelegramPostBatchPostDto,
  CreateAndDispatchTelegramPostBatchDto,
  CreateTelegramPostBatchDto,
  DispatchTelegramPostBatchDto,
  TelegramPostBatchDeliveriesQueryDto,
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

  @Post()
  createDraft(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTelegramPostBatchDto,
  ) {
    return this.command.createDraft(user.sub, dto);
  }

  @Post('import')
  importWorkflow(
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportTelegramPostBatchDto,
  ) {
    return this.command.importWorkflow(user.sub, dto.workflowId);
  }

  @Post('dispatch')
  createAndDispatch(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateAndDispatchTelegramPostBatchDto,
  ) {
    return this.command.createAndDispatch(user.sub, dto);
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

  @Delete(':id')
  removeDraft(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.command.removeDraft(user.sub, id);
  }

  @Post(':id/posts')
  addPost(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.command.addPost(user.sub, id);
  }

  @Post(':id/posts/:postId/import')
  importPost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Body() dto: ImportTelegramPostBatchPostDto,
  ) {
    return this.command.importPost(user.sub, id, postId, dto);
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
}
