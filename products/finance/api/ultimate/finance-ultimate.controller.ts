import {
  Body,
  BadRequestException,
  Controller,
  Param,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { ConsumerFinanceAssistantStreamEvent } from '@telegram-system/shared';
import { FinanceConsumerRequestService } from '@consumer-finance/api/http/finance-consumer-request.service';
import {
  FinanceAssistantEntryDto,
  FinanceAssistantMessageDto,
  FinanceAssistantTurnDto,
  UpdateFinanceAssistantProposalDto,
  FinanceUltimateQuestionDto,
} from '@consumer-finance/api/http/finance.dto';
import { FinanceUltimateService } from '@consumer-finance/api/ultimate/finance-ultimate.service';
import { FinanceAssistantEntryService } from '@consumer-finance/api/ultimate/finance-assistant-entry.service';

import { FinanceAssistantChatsService } from './finance-assistant-chats.service';

/** Compatibility route for the AI subsection of the consolidated Analytics experience. */
@Controller('finance-bots/:botId/ultimate')
export class FinanceUltimateController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly ultimate: FinanceUltimateService,
    private readonly entries: FinanceAssistantEntryService,
    private readonly chats: FinanceAssistantChatsService,
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
  async message(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() body: FinanceAssistantMessageDto,
    @Res() response: Response,
  ) {
    const session = this.requests.authenticate(botId, request);
    this.validateTurn(body);
    const identity = this.identity(session, botId);
    const abortController = new AbortController();
    request.once('aborted', () => abortController.abort());
    response.once('close', () => {
      if (!response.writableEnded) abortController.abort();
    });
    response.status(200);
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const write = (event: ConsumerFinanceAssistantStreamEvent) => {
      if (!response.destroyed && !response.writableEnded) {
        response.write(`${JSON.stringify(event)}\n`);
      }
    };
    write({ type: 'start' });
    let partialText = '';
    try {
      const stream: NonNullable<Parameters<FinanceUltimateService['message']>[2]> = {
        signal: abortController.signal,
        onMessageDelta: (delta) => {
          partialText += delta;
          write({ type: 'delta', delta });
        },
        onProgress: (stage, completed, total) => write({ type: 'progress', stage, completed, total }),
        onTiming: (timing) => write({ type: 'timing', ...timing }),
      };
      const result = body.chatId
        ? await this.chats.run(identity, body, (history, mode) =>
            this.ultimate.message(identity, { ...body, history }, stream, mode),
          { signal: stream.signal, partialText: () => partialText })
        : await this.ultimate.message(identity, body, stream);
      write({ type: 'done', result });
    } catch (error) {
      if (!abortController.signal.aborted) {
        write({
          type: 'error',
          message: 'Finance assistant request failed',
          code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
        });
      }
    } finally {
      if (!response.destroyed && !response.writableEnded) response.end();
    }
  }

  @Post('entry/media')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'file', maxCount: 1 },
        { name: 'files', maxCount: 5 },
      ],
      { limits: { fileSize: 8 * 1024 * 1024, files: 5 } },
    ),
  )
  async mediaEntry(
    @Param('botId') botId: string,
    @Req() request: Request,
    @UploadedFiles()
    uploaded:
      | { file?: Express.Multer.File[]; files?: Express.Multer.File[] }
      | undefined,
    @Body() body: FinanceAssistantTurnDto,
  ) {
    const identity = this.identity(this.requests.authenticate(botId, request), botId);
    this.validateTurn(body);
    const files = [...(uploaded?.file ?? []), ...(uploaded?.files ?? [])];
    if (!body.chatId) return this.entries.fromFiles(identity, files);
    const result = await this.chats.run(identity, {
      ...body, text: files.map((file) => file.originalname).join(', ').slice(0, 2000),
    }, async () => ({
      kind: 'PROPOSAL',
      message: '',
      proposal: await this.entries.fromFiles(identity, files),
    }), { attachment: true });
    return result.proposal;
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

  @Post('entry/:token/revise')
  reviseEntry(
    @Param('botId') botId: string,
    @Param('token') token: string,
    @Req() request: Request,
    @Body() body: UpdateFinanceAssistantProposalDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.entries.revise(this.identity(session, botId), token, body.operations, body.keepIndices);
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

  private validateTurn({ chatId, turnId }: FinanceAssistantTurnDto) {
    if (Boolean(chatId) !== Boolean(turnId))
      throw new BadRequestException('Chat and turn are required together');
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
