import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { FinanceConsumerRequestService } from '../http/finance-consumer-request.service';
import {
  FinanceAssistantEntryDto,
  FinanceAssistantMessageDto,
  FinanceUltimateQuestionDto,
} from '../http/finance.dto';
import { FinanceUltimateService } from './finance-ultimate.service';
import { FinanceAssistantEntryService } from './finance-assistant-entry.service';

/** Compatibility route for the AI subsection of the consolidated Analytics experience. */
@Controller('finance-bots/:botId/ultimate')
export class FinanceUltimateController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly ultimate: FinanceUltimateService,
    private readonly entries: FinanceAssistantEntryService,
  ) {}

  @Post('ask')
  ask(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() body: FinanceUltimateQuestionDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.ultimate.answer(
      {
        profileId: session.profileId,
        botIntegrationId: botId,
        workspaceId: session.workspaceId,
        telegramBotUserId: session.telegramBotUserId,
      },
      body,
    );
  }

  @Post('entry')
  entry(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() body: FinanceAssistantEntryDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.entries.fromText(this.identity(session, botId), body.text);
  }

  @Post('message')
  message(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() body: FinanceAssistantMessageDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.ultimate.message(this.identity(session, botId), body);
  }

  @Post('entry/media')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  mediaEntry(
    @Param('botId') botId: string,
    @Req() request: Request,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.entries.fromFile(this.identity(session, botId), file);
  }

  @Post('entry/:token/confirm')
  async confirmEntry(
    @Param('botId') botId: string,
    @Param('token') token: string,
    @Req() request: Request,
  ) {
    const session = this.requests.authenticate(botId, request);
    const result = await this.entries.confirm(
      this.identity(session, botId),
      token,
    );
    return {
      transactionIds: result.transactionIds,
      duplicate: result.duplicate,
    };
  }

  @Post('entry/:token/cancel')
  cancelEntry(
    @Param('botId') botId: string,
    @Param('token') token: string,
    @Req() request: Request,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.entries.cancel(this.identity(session, botId), token);
  }

  private identity(
    session: ReturnType<FinanceConsumerRequestService['authenticate']>,
    botId: string,
  ) {
    return {
      profileId: session.profileId,
      botIntegrationId: botId,
      telegramBotUserId: session.telegramBotUserId,
      workspaceId: session.workspaceId,
    };
  }
}
