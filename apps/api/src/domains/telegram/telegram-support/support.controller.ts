import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { TelegramSupportProduct, WorkspaceRole } from '@prisma/client';
import { IsString, IsUUID, MaxLength, Matches } from 'class-validator';
import { map, startWith } from 'rxjs';
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

class ReplyDto {
  @IsUUID()
  replyId!: string;

  @IsString()
  @MaxLength(4096)
  @Matches(/\S/)
  text!: string;
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
    );
  }

  @Sse('events')
  async events(@CurrentUser() user: JwtUser) {
    return this.tickets.events(await this.scope(user)).pipe(
      map(() => ({ data: { changed: true } })),
      startWith({ data: { changed: true } }),
    );
  }
}
