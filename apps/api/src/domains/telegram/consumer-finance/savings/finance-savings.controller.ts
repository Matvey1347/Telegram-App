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
import { FinanceConsumerRequestService } from '../http/finance-consumer-request.service';
import {
  FinanceSavingsAllocationDto,
  FinanceSavingsGoalInputDto,
  FinanceSavingsGoalQueryDto,
  FinanceSavingsMovementQueryDto,
  FinanceSavingsReallocationDto,
} from './finance-savings.dto';
import { FinanceSavingsService } from './finance-savings.service';

@Controller('finance-bots/:botId/savings-goals')
export class FinanceSavingsController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly savings: FinanceSavingsService,
  ) {}

  private profileId(botId: string, request: Request) {
    return this.requests.authenticate(botId, request).profileId;
  }

  @Get()
  list(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Query() query: FinanceSavingsGoalQueryDto,
  ) {
    return this.savings.list(this.profileId(botId, request), query);
  }

  @Post()
  create(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() input: FinanceSavingsGoalInputDto,
  ) {
    return this.savings.create(this.profileId(botId, request), input);
  }

  @Post('reallocate')
  reallocate(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() input: FinanceSavingsReallocationDto,
  ) {
    return this.savings.reallocate(this.profileId(botId, request), input);
  }

  @Get(':id')
  get(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.savings.goal(this.profileId(botId, request), id);
  }

  @Patch(':id')
  update(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceSavingsGoalInputDto,
  ) {
    return this.savings.update(this.profileId(botId, request), id, input);
  }

  @Post(':id/allocate')
  allocate(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceSavingsAllocationDto,
  ) {
    return this.savings.allocate(this.profileId(botId, request), id, input);
  }

  @Post(':id/release')
  release(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceSavingsAllocationDto,
  ) {
    return this.savings.release(this.profileId(botId, request), id, input);
  }

  @Post(':id/complete')
  complete(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.savings.complete(this.profileId(botId, request), id);
  }

  @Post(':id/archive')
  archive(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.savings.archive(this.profileId(botId, request), id);
  }

  @Get(':id/history')
  history(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Query() query: FinanceSavingsMovementQueryDto,
  ) {
    return this.savings.history(this.profileId(botId, request), id, query);
  }
}
