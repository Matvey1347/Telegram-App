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
  TelegramChannelPerformanceHistoryQueryDto,
  TelegramManagedPostLookupDto,
} from './telegram-channel-bounded-read.dto';
import { TelegramChannelPerformanceHistoryService } from './telegram-channel-performance-history.service';
import { TelegramManagedPostLookupService } from './telegram-managed-post-lookup.service';
import { TelegramPostGroupSummaryReadService } from './telegram-post-group-summary-read.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-channels')
export class TelegramChannelBoundedReadsController {
  constructor(
    private readonly managedPosts: TelegramManagedPostLookupService,
    private readonly postGroups: TelegramPostGroupSummaryReadService,
    private readonly performanceHistory: TelegramChannelPerformanceHistoryService,
  ) {}

  @Post(':id/managed-posts/lookup')
  lookupManagedPosts(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Body() dto: TelegramManagedPostLookupDto,
  ) {
    return this.managedPosts.lookup(user.sub, channelId, dto.ids);
  }

  @Get(':id/post-group-summaries')
  postGroupSummaries(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
  ) {
    return this.postGroups.summaries(user.sub, channelId);
  }

  @Get(':id/performance-history')
  channelPerformanceHistory(
    @CurrentUser() user: JwtUser,
    @Param('id') channelId: string,
    @Query() query: TelegramChannelPerformanceHistoryQueryDto,
  ) {
    return this.performanceHistory.history(user.sub, channelId, query.range);
  }
}
