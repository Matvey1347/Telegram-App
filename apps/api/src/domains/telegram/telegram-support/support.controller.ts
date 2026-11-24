import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Res,
  Sse,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { TelegramSupportProduct, WorkspaceRole } from '@prisma/client';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, Matches } from 'class-validator';
import { map, startWith } from 'rxjs';
import type { Response } from 'express';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { WorkspaceService } from '../../../common/workspace.service';
import {
  SupportTicketsService,
  type SupportUpdate,
} from './support-tickets.service';

class MessageTextDto {
  @IsString()
  @MaxLength(4096)
  @Matches(/\S/)
  text!: string;
}

class ReplyDto extends MessageTextDto {
  @IsUUID()
  replyId!: string;

  @IsOptional()
  @IsBoolean()
  formatted?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  targetId?: string;
}

@Controller('telegram-support')
export class SupportWebhookController {
  constructor(private readonly tickets: SupportTicketsService) {}

  @Post('webhooks/:product')
  @HttpCode(200)
  receive(
    @Param('product', new ParseEnumPipe(TelegramSupportProduct))
    product: TelegramSupportProduct,
    @Headers('x-telegram-bot-api-secret-token') signature: string | undefined,
    @Body() update: SupportUpdate,
  ) {
    return this.tickets.receive(product, signature, update);
  }
}

@UseGuards(JwtAuthGuard)
@Controller('telegram-support')
export class SupportController {
  constructor(
    private readonly tickets: SupportTicketsService,
    private readonly workspace: WorkspaceService,
  ) {}

  private async scope(user: JwtUser) {
    const access = await this.workspace.requireWorkspaceRole(user.sub, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
    return access.workspaceId;
  }

  @Get('summary')
  async summary(@CurrentUser() user: JwtUser) {
    return this.tickets.summary(await this.scope(user));
  }

  @Get('tickets')
  async list(
    @CurrentUser() user: JwtUser,
    @Query('closed') closed?: string,
    @Query(
      'product',
      new ParseEnumPipe(TelegramSupportProduct, { optional: true }),
    )
    product?: TelegramSupportProduct,
    @Query('cursor') cursor?: string,
  ) {
    return this.tickets.list(
      await this.scope(user),
      closed === 'true',
      product,
      cursor,
    );
  }

  @Get('tickets/:id/avatar')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async avatar(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('kind', new ParseEnumPipe({ sender: 'sender', bot: 'bot' })) kind: 'sender' | 'bot',
    @Res({ passthrough: true }) response: Response,
  ) {
    const avatar = await this.tickets.avatar(await this.scope(user), id, kind);
    if (!avatar) {
      response.status(204);
      return;
    }
    return new StreamableFile(avatar.bytes, { type: avatar.contentType });
  }

  @Get('tickets/:id/messages')
  async thread(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.tickets.thread(await this.scope(user), id, cursor);
  }

  @Patch('tickets/:id/close')
  async close(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.tickets.close(await this.scope(user), id);
  }

  @Patch('tickets/:id/reopen')
  async reopen(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.tickets.reopen(await this.scope(user), id);
  }

  @Post('tickets/:id/reply')
  async reply(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() body: ReplyDto,
  ) {
    return this.tickets.reply(
      await this.scope(user),
      id,
      body.replyId,
      body.text.trim(),
      body.formatted,
      body.targetId,
    );
  }

  @Patch('tickets/:id/messages/:messageId')
  async editMessage(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('messageId') messageId: string, @Body() body: MessageTextDto) {
    return this.tickets.changeMessage(await this.scope(user), id, messageId, body.text.trim());
  }

  @Delete('tickets/:id/messages/:messageId')
  async deleteMessage(@CurrentUser() user: JwtUser, @Param('id') id: string, @Param('messageId') messageId: string) {
    return this.tickets.changeMessage(await this.scope(user), id, messageId);
  }

  @Sse('events')
  async events(@CurrentUser() user: JwtUser) {
    return this.tickets.events(await this.scope(user)).pipe(
      map(() => ({ data: { changed: true } })),
      startWith({ data: { changed: true } }),
    );
  }
}
