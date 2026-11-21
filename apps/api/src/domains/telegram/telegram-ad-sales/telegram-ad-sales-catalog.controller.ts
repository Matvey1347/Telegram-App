import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  CreateTelegramAdProductDto,
  RecommendTelegramAdPolicyDto,
  TelegramAdPriceHistoryQueryDto,
  TelegramAdProductsQueryDto,
  TelegramAdProductsByChannelsQueryDto,
  UpdateTelegramAdChannelPricingDto,
  UpdateTelegramAdSalesMemberPreferencesDto,
  UpdateTelegramAdSalesWorkspaceSettingsDto,
  UpdateTelegramAdPolicyDto,
  UpdateTelegramAdProductDto,
} from './dto';
import { TelegramAdSalesService } from './telegram-ad-sales.service';
import { TelegramAdSalesWorkspaceSettingsService } from './telegram-ad-sales-workspace-settings.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-ad-sales')
export class TelegramAdSalesCatalogController {
  constructor(
    private readonly service: TelegramAdSalesService,
    private readonly workspaceSettingsService: TelegramAdSalesWorkspaceSettingsService,
  ) {}

  @Get('settings/workspace')
  getWorkspaceSettings(@CurrentUser() user: JwtUser) {
    return this.workspaceSettingsService.get(user.sub);
  }

  @Put('settings/workspace')
  updateWorkspaceSettings(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateTelegramAdSalesWorkspaceSettingsDto,
  ) {
    return this.workspaceSettingsService.update(user.sub, dto);
  }

  @Get('preferences')
  getPreferences(@CurrentUser() user: JwtUser) {
    return this.service.getAdSalesMemberPreferences(user.sub);
  }

  @Put('preferences')
  updatePreferences(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateTelegramAdSalesMemberPreferencesDto,
  ) {
    return this.service.updateAdSalesMemberPreferences(user.sub, dto);
  }

  @Get('products')
  listProducts(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdProductsQueryDto,
  ) {
    return this.service.listProducts(user.sub, query);
  }

  @Get('products/by-channels')
  listProductsByChannels(
    @CurrentUser() user: JwtUser,
    @Query() query: TelegramAdProductsByChannelsQueryDto,
  ) {
    return this.service.listProductsByChannels(
      user.sub,
      query.channelIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    );
  }

  @Get('channels/:channelId/products')
  listChannelProducts(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.listChannelProducts(user.sub, channelId);
  }

  @Get('channels/:channelId/setup')
  getChannelSetup(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.getChannelSetup(user.sub, channelId);
  }

  @Post('channels/:channelId/products')
  createProduct(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: CreateTelegramAdProductDto,
  ) {
    return this.service.createProduct(user.sub, channelId, dto);
  }

  @Patch('products/:id')
  updateProduct(
    @CurrentUser() user: JwtUser,
    @Param('id') id: string,
    @Body() dto: UpdateTelegramAdProductDto,
  ) {
    return this.service.updateProduct(user.sub, id, dto);
  }

  @Delete('products/:id')
  deactivateProduct(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.deactivateProduct(user.sub, id);
  }

  @Get('channels/:channelId/policy')
  getPolicy(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.getPolicy(user.sub, channelId);
  }

  @Get('channels/:channelId/baseline')
  getChannelBaseline(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
  ) {
    return this.service.getChannelBaseline(user.sub, channelId);
  }

  @Put('channels/:channelId/pricing')
  updateChannelPricing(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateTelegramAdChannelPricingDto,
  ) {
    return this.service.updateChannelPricing(user.sub, channelId, dto);
  }

  @Put('channels/:channelId/policy')
  upsertPolicy(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: UpdateTelegramAdPolicyDto,
  ) {
    return this.service.upsertPolicy(user.sub, channelId, dto);
  }

  @Post('channels/:channelId/policy/recommend')
  recommendPolicy(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Body() dto: RecommendTelegramAdPolicyDto,
  ) {
    return this.service.recommendPolicy(user.sub, channelId, dto);
  }

  @Get('channels/:channelId/price-history')
  priceHistory(
    @CurrentUser() user: JwtUser,
    @Param('channelId') channelId: string,
    @Query() query: TelegramAdPriceHistoryQueryDto,
  ) {
    return this.service.priceHistory(user.sub, channelId, query);
  }
}
