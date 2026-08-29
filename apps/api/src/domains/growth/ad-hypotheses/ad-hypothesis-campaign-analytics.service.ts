import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdHypothesisCampaignAnalyticsInputDto } from './dto/campaign-analytics-input.dto';

@Injectable()
export class AdHypothesisCampaignAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  async update(
    userId: string,
    hypothesisId: string,
    dto: AdHypothesisCampaignAnalyticsInputDto,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.$transaction(async (tx) => {
      const hypothesis = await tx.adHypothesis.findFirst({
        where: { id: hypothesisId, workspaceId },
        select: { id: true },
      });
      if (!hypothesis) throw new NotFoundException('Ad hypothesis not found');
      const links = await tx.adHypothesisCampaign.findMany({
        where: { hypothesisId, workspaceId },
        select: { adCampaignId: true },
        orderBy: { adCampaignId: 'asc' },
      });
      const campaignIds = links.map((link) => link.adCampaignId);
      const updated = campaignIds.length
        ? await tx.adCampaign.updateMany({
            where: { workspaceId, id: { in: campaignIds } },
            data: { excludeFromAnalytics: dto.excludeFromAnalytics },
          })
        : { count: 0 };
      return {
        hypothesisId,
        campaignIds,
        updatedCount: updated.count,
        excludeFromAnalytics: dto.excludeFromAnalytics,
      };
    });
  }
}
