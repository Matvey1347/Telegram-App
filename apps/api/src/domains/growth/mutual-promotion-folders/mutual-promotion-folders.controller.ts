import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
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
import { StreamResponseService } from '../../../common/stream/stream-response.service';
import {
  CreateMutualPromotionFolderDto,
  CreateMutualPromotionPostDto,
  ImportMutualPromotionInviteLinkDto,
  MutualPromotionExpenseDto,
  MutualPromotionFolderQueryDto,
  MutualPromotionInviteOptionsQueryDto,
  UpdateMutualPromotionFolderDto,
  UpdateMutualPromotionInviteLinksDto,
  UpdateMutualPromotionPostDto,
} from './dto';
import { MutualPromotionCommandService } from './mutual-promotion-command.service';
import { MutualPromotionExpenseService } from './mutual-promotion-expense.service';
import { MutualPromotionInviteLinkEditService } from './mutual-promotion-invite-link-edit.service';
import { MutualPromotionInviteLinkImportService } from './mutual-promotion-invite-link-import.service';
import { MutualPromotionReadService } from './mutual-promotion-read.service';

@UseGuards(JwtAuthGuard)
@Controller('mutual-promotion-folders')
export class MutualPromotionFoldersController {
  constructor(
    private readonly commands: MutualPromotionCommandService,
    private readonly expenses: MutualPromotionExpenseService,
    private readonly inviteLinkEdits: MutualPromotionInviteLinkEditService,
    private readonly inviteLinkImports: MutualPromotionInviteLinkImportService,
    private readonly reads: MutualPromotionReadService,
    private readonly streamResponse: StreamResponseService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query() query: MutualPromotionFolderQueryDto,
  ) {
    return this.reads.list(user.sub, query);
  }

  @Get('invite-link-options')
  inviteLinkOptions(
    @CurrentUser() user: JwtUser,
    @Query() query: MutualPromotionInviteOptionsQueryDto,
  ) {
    return this.reads.inviteLinkOptions(user.sub, query);
  }

  @Post('invite-link-options/import')
  importInviteLink(
    @CurrentUser() user: JwtUser,
    @Body() dto: ImportMutualPromotionInviteLinkDto,
  ) {
    return this.inviteLinkImports.import(user.sub, dto);
  }

  @Post()
  create(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateMutualPromotionFolderDto,
  ) {
    return this.commands.create(user.sub, dto);
  }

  @Get(':id')
  detail(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.reads.detail(user.sub, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateMutualPromotionFolderDto,
  ) {
    return this.commands.update(user.sub, id, dto);
  }

  @Patch(':id/invite-links')
  updateInviteLinks(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateMutualPromotionInviteLinksDto,
  ) {
    return this.inviteLinkEdits.update(user.sub, id, dto);
  }

  @Post(':id/posts')
  addPost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: CreateMutualPromotionPostDto,
  ) {
    return this.commands.addPost(user.sub, id, dto);
  }

  @Patch(':id/posts/:postId')
  updatePost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
    @Body() dto: UpdateMutualPromotionPostDto,
  ) {
    return this.commands.updatePost(user.sub, id, postId, dto);
  }

  @Delete(':id/posts/:postId')
  removePost(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('postId') postId: string,
  ) {
    return this.commands.removePost(user.sub, id, postId);
  }

  @Post(':id/activate')
  activate(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    return this.streamResponse.stream(response, {
      eventPrefix: 'mutual_promotion.activation_stream',
      action: (onProgress) => this.commands.activate(user.sub, id, onProgress),
    });
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.commands.cancel(user.sub, id);
  }

  @Put(':id/participants/:participantId/expense')
  upsertExpense(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('participantId') participantId: string,
    @Body() dto: MutualPromotionExpenseDto,
  ) {
    return this.expenses.upsert(user.sub, id, participantId, dto);
  }
}
