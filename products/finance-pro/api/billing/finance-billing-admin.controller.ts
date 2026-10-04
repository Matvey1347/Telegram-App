import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '@api/common/current-user.decorator';
import type { JwtUser } from '@api/common/current-user.decorator';
import { JwtAuthGuard } from '@api/common/jwt-auth.guard';
import { FinanceBillingService } from '@finance-pro/api/billing/finance-billing.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-bots/:botId/finance-billing')
export class FinanceBillingAdminController {
  constructor(private readonly billing: FinanceBillingService) {}

  @Post('sync')
  sync(@CurrentUser() user: JwtUser, @Param('botId') botId: string) {
    return this.billing.syncCatalog(user.sub, botId);
  }

  @Post('coupons/:couponId/sync')
  syncCoupon(
    @CurrentUser() user: JwtUser,
    @Param('botId') botId: string,
    @Param('couponId') couponId: string,
  ) {
    return this.billing.syncCoupon(user.sub, botId, couponId);
  }
}
