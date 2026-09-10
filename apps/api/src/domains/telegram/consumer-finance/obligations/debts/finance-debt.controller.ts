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
  FinanceDebtInputDto,
  FinanceDebtQueryDto,
} from '../finance-obligation.dto';
import { FinanceConsumerRequestService } from '../../http/finance-consumer-request.service';
import { FinanceDebtService } from './finance-debt.service';

@Controller('finance-bots/:botId/debts')
export class FinanceDebtController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly debts: FinanceDebtService,
  ) {}

  @Get()
  list(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Query() query: FinanceDebtQueryDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.debts.list(session.profileId, query);
  }

  @Post()
  create(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() input: FinanceDebtInputDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.debts.create(session.profileId, input);
  }

  @Patch(':id')
  update(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceDebtInputDto,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.debts.update(session.profileId, id, input);
  }

  @Post(':id/settle')
  settle(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    const session = this.requests.authenticate(botId, request);
    return this.debts.settle(session.profileId, id);
  }
}
