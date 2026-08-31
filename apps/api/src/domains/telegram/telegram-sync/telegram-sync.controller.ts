import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { DailyAnalyticsSyncService } from './daily-analytics-sync.service';
import { TelegramWorkspaceFullSyncService } from './telegram-workspace-full-sync.service';
import { TelegramWorkspaceManualSyncDto } from './telegram-workspace-sync.dto';

@UseGuards(JwtAuthGuard)
@Controller('telegram-sync')
export class TelegramSyncController {
  constructor(
    private workspaceService: WorkspaceService,
    private prisma: PrismaService,
    private dailyAnalyticsSyncService: DailyAnalyticsSyncService,
    private telegramWorkspaceFullSyncService: TelegramWorkspaceFullSyncService,
  ) {}

  @Post('workspace-channels/run')
  async runWorkspaceSync(
    @CurrentUser() user: JwtUser,
    @Body() dto: TelegramWorkspaceManualSyncDto,
  ) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(
      user.sub,
    );
    return this.telegramWorkspaceFullSyncService.syncWorkspace({
      workspaceId,
      actor: { type: 'MANUAL', userId: user.sub },
      selection: dto.selection,
    });
  }

  @Post('daily-analytics/run')
  async runDailyAnalytics(@CurrentUser() user: JwtUser) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(
      user.sub,
    );
    return this.dailyAnalyticsSyncService.runDailyAnalyticsSync({
      workspaceId,
      source: 'manual',
    });
  }

  @Get('daily-analytics/last-run')
  async lastRun(@CurrentUser() user: JwtUser) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(
      user.sub,
    );
    return this.prisma.dailyAnalyticsSyncRun.findFirst({
      where: { workspaceId },
      orderBy: { startedAt: 'desc' },
    });
  }

  @Get('daily-analytics/runs')
  async runs(@CurrentUser() user: JwtUser, @Query('limit') limit?: string) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(
      user.sub,
    );
    const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
    return this.prisma.dailyAnalyticsSyncRun.findMany({
      where: { workspaceId },
      orderBy: { startedAt: 'desc' },
      take: safeLimit,
    });
  }
}
