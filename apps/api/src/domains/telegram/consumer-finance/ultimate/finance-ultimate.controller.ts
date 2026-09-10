import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { FinanceConsumerRequestService } from '../http/finance-consumer-request.service';
import { FinanceUltimateQuestionDto } from '../http/finance.dto';
import { FinanceUltimateService } from './finance-ultimate.service';

/** Compatibility route for the AI subsection of the consolidated Analytics experience. */
@Controller('finance-bots/:botId/ultimate')
export class FinanceUltimateController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly ultimate: FinanceUltimateService,
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
}
