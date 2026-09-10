import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  FinanceApplyOccurrenceAmountDto,
  FinanceRegularPaymentConfirmDto,
  FinanceRegularPaymentInputDto,
  FinanceRegularPaymentQueryDto,
  FinanceRegularPaymentRevisionQueryDto,
} from '../finance-obligation.dto';
import { FinanceConsumerRequestService } from '../../http/finance-consumer-request.service';
import { FinanceRegularPaymentConfirmationService } from './finance-regular-payment-confirmation.service';
import { FinanceRegularPaymentService } from './finance-regular-payment.service';

@Controller('finance-bots/:botId/regular-payments')
export class FinanceRegularPaymentController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly regularPayments: FinanceRegularPaymentService,
    private readonly confirmations: FinanceRegularPaymentConfirmationService,
  ) {}

  @Get()
  list(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Query() query: FinanceRegularPaymentQueryDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.regularPayments.list(session.profileId, query);
  }

  @Post()
  create(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() input: FinanceRegularPaymentInputDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.regularPayments.create(session.profileId, input);
  }

  @Patch(':id')
  update(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceRegularPaymentInputDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.regularPayments.update(session.profileId, id, input);
  }

  @Get(':id/revisions')
  revisions(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Query() query: FinanceRegularPaymentRevisionQueryDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.regularPayments.revisions(session.profileId, id, query);
  }

  @Post(':id/pause')
  pause(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.regularPayments.changeStatus(session.profileId, id, 'PAUSED');
  }

  @Post(':id/resume')
  resume(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.regularPayments.changeStatus(session.profileId, id, 'ACTIVE');
  }

  @Post(':id/cancel')
  cancel(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.regularPayments.changeStatus(session.profileId, id, 'CANCELED');
  }

  @Post(':id/confirm')
  confirm(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceRegularPaymentConfirmDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.confirmations.confirm(session.profileId, id, input);
  }

  @Post(':id/occurrences/:occurrenceId/apply-amount')
  applyAmount(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Param('occurrenceId') occurrenceId: string,
    @Req() request: Request,
    @Body() input: FinanceApplyOccurrenceAmountDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.confirmations.applyFutureAmount(
      session.profileId,
      id,
      occurrenceId,
      input,
    );
  }
}
