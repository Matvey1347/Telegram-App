import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  TelegramAdAlertsQueryDto,
  TelegramAdAnalyticsQueryDto,
  TelegramAdAnalyticsSeriesQueryDto,
  TelegramAdInventoryDetailsQueryDto,
  TelegramAdInventoryRebuildDto,
  TelegramAdNetworkAnalyticsQueryDto,
  TelegramAdPriceFillCorrelationQueryDto,
  TelegramAdRevenueScenarioDto,
} from './dto';
import { TelegramAdSalesService } from './telegram-ad-sales.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-ad-sales')
export class TelegramAdSalesAnalyticsController {
  constructor(private readonly service: TelegramAdSalesService) {}

  @Get('analytics/summary')
  analyticsSummary(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsQueryDto,
  ) {
    return this.service.analyticsSummary(user.sub, query);
  }

  @Get('analytics/overview')
  analyticsOverview(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    return this.service.analyticsOverview(user.sub, query);
  }

  @Get('analytics/channels/:channelId')
  channelAnalytics(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Query() query: TelegramAdAnalyticsQueryDto,
  ) {
    return this.service.channelAnalytics(user.sub, channelId, query);
  }

  @Get('analytics/networks/:networkId')
  networkAnalytics(
    @CurrentUser() user: JwtUser,
    @Param('networkId') networkId: string,
    @Query() query: TelegramAdNetworkAnalyticsQueryDto,
  ) {
    return this.service.networkAnalytics(user.sub, networkId, query);
  }

  @Get('analytics/revenue-series')
  revenueSeries(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    return this.service.revenueSeries(user.sub, query);
  }

  @Get('analytics/pricing-series')
  pricingSeries(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    return this.service.pricingSeries(user.sub, query);
  }

  @Get('analytics/inventory')
  inventory(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAnalyticsSeriesQueryDto,
  ) {
    return this.service.inventoryAnalytics(user.sub, query);
  }

  @Get('analytics/alerts')
  alerts(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdAlertsQueryDto,
  ) {
    return this.service.analyticsAlerts(user.sub, query);
  }

  @Post('analytics/inventory/rebuild')
  rebuildInventory(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdInventoryRebuildDto,
  ) {
    return this.service.rebuildInventorySnapshots(user.sub, dto);
  }

  @Get('analytics/price-fill-correlation')
  priceFillCorrelation(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdPriceFillCorrelationQueryDto,
  ) {
    return this.service.priceFillCorrelation(user.sub, query);
  }

  @Post('analytics/revenue-scenario')
  revenueScenario(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramAdRevenueScenarioDto,
  ) {
    return this.service.revenueScenario(user.sub, dto);
  }

  @Get('analytics/inventory/details')
  inventoryDetails(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdInventoryDetailsQueryDto,
  ) {
    return this.service.inventoryDetails(user.sub, query);
  }
}
