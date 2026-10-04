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
  FinanceInvestmentCashFlowDto,
  FinanceInvestmentCloseDto,
  FinanceInvestmentHistoryQueryDto,
  FinanceInvestmentInputDto,
  FinanceInvestmentQueryDto,
  FinanceInvestmentUpdateDto,
  FinanceInvestmentValuationDto,
} from './finance-investment.dto';
import { FinanceInvestmentService } from './finance-investment.service';
import { FinanceAssetSummaryService } from '../assets/finance-asset-summary.service';

@Controller('finance-bots/:botId/investments')
export class FinanceInvestmentController {
  constructor(
    private readonly requests: FinanceConsumerRequestService,
    private readonly investments: FinanceInvestmentService,
    private readonly assets: FinanceAssetSummaryService,
  ) {}

  private profileId(botId: string, request: Request) {
    return this.requests.authenticate(botId, request).profileId;
  }

  @Get()
  list(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Query() query: FinanceInvestmentQueryDto,
  ) {
    return this.investments.list(this.profileId(botId, request), query);
  }

  @Post()
  create(
    @Param('botId') botId: string,
    @Req() request: Request,
    @Body() input: FinanceInvestmentInputDto,
  ) {
    return this.investments.create(this.profileId(botId, request), input);
  }

  @Get('summary')
  async summary(@Param('botId') botId: string, @Req() request: Request) {
    const profileId = this.profileId(botId, request);
    return (await this.assets.overview(profileId)).investments;
  }

  @Get(':id')
  detail(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.investments.detail(this.profileId(botId, request), id);
  }

  @Patch(':id')
  update(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceInvestmentUpdateDto,
  ) {
    return this.investments.update(this.profileId(botId, request), id, input);
  }

  @Get(':id/cash-flows')
  cashFlows(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Query() query: FinanceInvestmentHistoryQueryDto,
  ) {
    return this.investments.cashFlows(
      this.profileId(botId, request),
      id,
      query,
    );
  }

  @Post(':id/cash-flows')
  recordCashFlow(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceInvestmentCashFlowDto,
  ) {
    return this.investments.recordCashFlow(
      this.profileId(botId, request),
      id,
      input,
    );
  }

  @Get(':id/valuations')
  valuations(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Query() query: FinanceInvestmentHistoryQueryDto,
  ) {
    return this.investments.valuations(
      this.profileId(botId, request),
      id,
      query,
    );
  }

  @Post(':id/valuations')
  recordValuation(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceInvestmentValuationDto,
  ) {
    return this.investments.recordValuation(
      this.profileId(botId, request),
      id,
      input,
    );
  }

  @Post(':id/close')
  close(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
    @Body() input: FinanceInvestmentCloseDto,
  ) {
    return this.investments.close(this.profileId(botId, request), id, input);
  }

  @Post(':id/archive')
  archive(
    @Param('botId') botId: string,
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.investments.archive(this.profileId(botId, request), id);
  }
}
