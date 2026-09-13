import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type JwtUser,
} from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  DistributeReinvestmentDto,
  SettleCommissionDto,
  WithdrawReinvestmentDto,
} from './dto';
import { MemberFinanceService } from './member-finance.service';
import { MemberFinanceReadService } from './member-finance-read.service';

@UseGuards(JwtAuthGuard)
@Controller('member-finance')
export class MemberFinanceController {
  constructor(
    private readonly service: MemberFinanceService,
    private readonly reads: MemberFinanceReadService,
  ) {}

  @Get('summaries')
  summaries(@CurrentUser() user: JwtUser) {
    return this.reads.summaries(user.sub);
  }

  @Get(':memberId')
  details(@CurrentUser() user: JwtUser, @Param('memberId') memberId: string) {
    return this.reads.details(user.sub, memberId);
  }

  @Post(':memberId/pay')
  pay(
    @CurrentUser() user: JwtUser,
    @Param('memberId') memberId: string,
    @Body() dto: SettleCommissionDto,
  ) {
    return this.service.payCommission(user.sub, memberId, dto);
  }

  @Post(':memberId/invest-salary')
  investSalary(
    @CurrentUser() user: JwtUser,
    @Param('memberId') memberId: string,
    @Body() dto: SettleCommissionDto,
  ) {
    return this.service.investCommission(user.sub, memberId, dto);
  }

  @Post(':memberId/withdraw-reinvestment')
  withdraw(
    @CurrentUser() user: JwtUser,
    @Param('memberId') memberId: string,
    @Body() dto: WithdrawReinvestmentDto,
  ) {
    return this.service.withdrawReinvestment(user.sub, memberId, dto);
  }

  @Post('reinvestment/distribute')
  distribute(
    @CurrentUser() user: JwtUser,
    @Body() dto: DistributeReinvestmentDto,
  ) {
    return this.service.distributeReinvestment(user.sub, dto);
  }
}
