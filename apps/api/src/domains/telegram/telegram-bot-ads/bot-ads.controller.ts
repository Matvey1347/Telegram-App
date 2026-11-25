import {
  Body,
  Controller,
  Get,
  Head,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import {
  ArchiveBotAdPromoDto,
  BotAdsLinkQueryDto,
  BotAdsPromoQueryDto,
  BotAdsScopeDto,
  CreateBotAdLinkDto,
  CreateBotAdPlacementsDto,
  BotAdChannelsDto,
  PublishBotAdDto,
  SaveBotAdPromoDto,
} from './bot-ads.dto';
import { BotAdsService } from './bot-ads.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-bots/:botIntegrationId/ads')
export class BotAdsController {
  constructor(private readonly ads: BotAdsService) {}

  @Get('promos')
  promos(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() query: BotAdsPromoQueryDto,
  ) {
    return this.ads.promos(
      { userId: user.sub, botIntegrationId, environment: query.environment },
      query,
    );
  }

  @Post('promos')
  createPromo(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() scope: BotAdsScopeDto,
    @Body() dto: SaveBotAdPromoDto,
  ) {
    return this.ads.savePromo(
      { userId: user.sub, botIntegrationId, ...scope },
      dto,
    );
  }

  @Patch('promos/:id')
  savePromo(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() scope: BotAdsScopeDto,
    @Param('id') id: string,
    @Body() dto: SaveBotAdPromoDto,
  ) {
    return this.ads.savePromo(
      { userId: user.sub, botIntegrationId, ...scope },
      dto,
      id,
    );
  }

  @Patch('promos/:id/archive')
  archivePromo(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() scope: BotAdsScopeDto,
    @Param('id') id: string,
    @Body() dto: ArchiveBotAdPromoDto,
  ) {
    return this.ads.archivePromo(
      { userId: user.sub, botIntegrationId, ...scope },
      id,
      dto.archived,
    );
  }

  @Get('links')
  links(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() query: BotAdsLinkQueryDto,
  ) {
    return this.ads.links(
      { userId: user.sub, botIntegrationId, environment: query.environment },
      query,
    );
  }

  @Post('links')
  createLink(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() scope: BotAdsScopeDto,
    @Body() dto: CreateBotAdLinkDto,
  ) {
    return this.ads.createLink(
      { userId: user.sub, botIntegrationId, ...scope },
      dto,
    );
  }

  @Get('channels')
  channels(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() { environment }: BotAdChannelsDto,
  ) {
    return this.ads.channels({
      userId: user.sub,
      botIntegrationId,
      environment,
    });
  }

  @Get('placements/promos')
  placementPromos(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() scope: BotAdsScopeDto,
  ) {
    return this.ads.placementPromos({
      userId: user.sub,
      botIntegrationId,
      ...scope,
    });
  }

  @Post('placements')
  createPlacements(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() scope: BotAdsScopeDto,
    @Body() dto: CreateBotAdPlacementsDto,
  ) {
    return this.ads.createPlacements(
      { userId: user.sub, botIntegrationId, ...scope },
      dto,
    );
  }

  @Post('links/:id/publish')
  publish(
    @CurrentUser() user: JwtUser,
    @Param('botIntegrationId') botIntegrationId: string,
    @Query() scope: BotAdsScopeDto,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: PublishBotAdDto,
  ) {
    return this.ads.publish(
      { userId: user.sub, botIntegrationId, ...scope },
      id,
      dto.scheduledAt,
    );
  }
}

@Controller('bot-ad-links')
export class BotAdRedirectController {
  constructor(private readonly ads: BotAdsService) {}

  @Head(':id')
  @Header('Cache-Control', 'no-store')
  @Redirect(undefined, 302)
  async preview(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return { url: await this.ads.redirect(id, false) };
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Redirect(undefined, 302)
  async open(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Headers('user-agent') userAgent?: string,
    @Headers('sec-purpose') purpose?: string,
  ) {
    const preview =
      /bot|crawler|spider/i.test(userAgent ?? '') ||
      Boolean(purpose?.includes('prefetch'));
    return { url: await this.ads.redirect(id, !preview) };
  }
}
