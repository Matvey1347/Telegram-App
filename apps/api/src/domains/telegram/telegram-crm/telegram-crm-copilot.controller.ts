import type { Request } from 'express';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { TelegramCrmCopilotService } from './telegram-crm-copilot.service';
import { TelegramCrmCopilotContextService } from './telegram-crm-copilot-context.service';
import { TelegramCrmCopilotDraftsService } from './telegram-crm-copilot-drafts.service';
import {
  CrmCopilotContextQueryDto,
  CrmCopilotGenerateDto,
  CrmCopilotPatchDto,
  CrmCopilotSuggestDto,
} from './telegram-crm-copilot.dto';
import { persistedCopilotFacts } from './telegram-crm-copilot-policy';
@UseGuards(JwtAuthGuard)
@Controller('telegram-crm/conversations/:id/copilot')
export class TelegramCrmCopilotController {
  constructor(
    private readonly service: TelegramCrmCopilotService,
    private readonly drafts: TelegramCrmCopilotDraftsService,
    private readonly context: TelegramCrmCopilotContextService,
  ) {}
  @Get() list(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.drafts.list(user.sub, id);
  }
  @Get('context') async details(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Query() query: CrmCopilotContextQueryDto,
  ) {
    const view = await this.context.build(user.sub, id, query);
    return {
      conversationId: view.conversationId,
      contactId: view.contactId,
      contactName: view.contactName,
      processingEnabled: view.processingEnabled,
      processingReference: view.processingReference,
      canGenerate: view.canGenerate,
      blockedReason: view.blockedReason,
      facts: persistedCopilotFacts(view.facts),
      missingFacts: view.missingFacts,
      warnings: view.warnings,
      contextVersion: view.contextVersion,
      products: view.products,
    };
  }
  @Post('generate') async generate(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: CrmCopilotGenerateDto,
    @Req() request: Request,
  ) {
    const controller = new AbortController();
    const response = request.res;
    const abort = () => {
      if (!response?.writableEnded) controller.abort();
    };
    request.once('aborted', abort);
    response?.once('close', abort);
    if (request.aborted) controller.abort();
    try {
      return await this.service.generate(
        user.sub,
        id,
        input,
        controller.signal,
      );
    } finally {
      request.removeListener('aborted', abort);
      response?.removeListener('close', abort);
    }
  }
  @Post('suggest') async suggest(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: CrmCopilotSuggestDto,
    @Req() request: Request,
  ) {
    const controller = new AbortController();
    const response = request.res;
    const abort = () => {
      if (!response?.writableEnded) controller.abort();
    };
    request.once('aborted', abort);
    response?.once('close', abort);
    if (request.aborted) controller.abort();
    try {
      return await this.service.suggest(user.sub, id, input, controller.signal);
    } finally {
      request.removeListener('aborted', abort);
      response?.removeListener('close', abort);
    }
  }
  @Patch('drafts/:draftId') patch(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('draftId') draftId: string,
    @Body() input: CrmCopilotPatchDto,
  ) {
    return this.service.patch(user.sub, id, draftId, input);
  }
}
