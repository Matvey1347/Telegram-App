import { LeadPageDto } from './lead-source.dto';
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
} from '../../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../../common/jwt-auth.guard';
import { TelegramLeadPreparationReadService } from './lead-preparation-read.service';
import { TelegramLeadPreparationQueueService } from './lead-preparation-queue.service';
import { TelegramLeadQualificationService } from './lead-qualification.service';
import { TelegramLeadCandidateDraftService } from './lead-candidate-draft.service';
import {
  LeadQualifyDto,
  LeadPrepareDraftDto,
  LeadQualificationDecisionDto,
  LeadPreparedDraftPatchDto,
  LeadPreparationQueueDto,
} from './lead-preparation.dto';
@UseGuards(JwtAuthGuard)
@Controller('telegram-crm/lead-discovery')
export class TelegramLeadPreparationController {
  constructor(
    private readonly read: TelegramLeadPreparationReadService,
    private readonly queue: TelegramLeadPreparationQueueService,
    private readonly qualification: TelegramLeadQualificationService,
    private readonly drafts: TelegramLeadCandidateDraftService,
  ) {}
  @Get('preparation/queue') list(
    @CurrentUser() user: JwtUser,
    @Query() input: LeadPreparationQueueDto,
  ) {
    return this.queue.list(user.sub, input);
  }
  @Get('preparation/products') products(
    @CurrentUser() user: JwtUser,
    @Query() input: LeadPageDto,
  ) {
    return this.read.context.packages.list(user.sub, input);
  }
  @Get('candidates/:id/preparation') view(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
  ) {
    return this.read.view(user.sub, id);
  }
  @Post('candidates/:id/qualify') qualify(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadQualifyDto,
  ) {
    return this.qualification.qualify(user.sub, id, input);
  }
  @Patch('candidates/:id/qualification-decision') decide(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadQualificationDecisionDto,
  ) {
    return this.qualification.decide(user.sub, id, input);
  }
  @Post('candidates/:id/drafts') generate(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() input: LeadPrepareDraftDto,
  ) {
    return this.drafts.generate(user.sub, id, input);
  }
  @Patch('candidates/:id/drafts/:draftId') patch(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Param('draftId') draftId: string,
    @Body() input: LeadPreparedDraftPatchDto,
  ) {
    return this.drafts.patch(user.sub, id, draftId, input);
  }
  @Get('contacts/:contactId/preparations') linked(
    @CurrentUser() user: JwtUser,
    @Param('contactId') id: string,
  ) {
    return this.queue.linked(user.sub, id);
  }
}
