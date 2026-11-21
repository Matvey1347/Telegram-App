import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { isCampaignStorageMissing } from './ad-campaign-promo-storage';

export function shapeAdmissionViewAnalytics(
  batches: Array<any>,
  pointLimit = 30,
  campaignJoinedCount?: number | null,
) {
  const sortedBatches = [...batches].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  // A later, small invite-link delta must not replace the campaign's main
  // measurement cohort in the list card. It can use the same channel posts
  // as another campaign and would otherwise make two unrelated campaigns
  // appear to have identical before/after views.
  const latestBatch = primaryAdmissionBatch(sortedBatches);
  const latestPoints = latestBatch?.viewSnapshots ?? [];
  const latestPoint =
    [...latestPoints].sort(
      (a, b) =>
        new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime(),
    )[0] ?? null;
  const points = latestPoints
    .slice()
    .sort(
      (a, b) =>
        new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime(),
    )
    .slice(-pointLimit)
    .map((point) => ({
      collectedAt: point.collectedAt,
      avgViews: point.avgViews,
      cumulativeAvgViewsUplift: point.cumulativeAvgViewsUplift,
      incrementalAvgViewsUplift: point.incrementalAvgViewsUplift,
      estimatedActiveSubscribers: point.estimatedActiveSubscribers,
      activationRate: point.activationRate,
    }));
  const releasedSubscribersCount =
    campaignJoinedCount != null && Number.isFinite(Number(campaignJoinedCount))
      ? Math.max(0, Number(campaignJoinedCount))
      : sortedBatches.reduce(
          (sum, batch) => sum + Number(batch.releasedSubscribersCount || 0),
          0,
        );
  const cumulativeAvgViewsUplift =
    latestPoint?.cumulativeAvgViewsUplift ?? null;
  const incrementalAvgViewsUplift =
    latestPoint?.incrementalAvgViewsUplift ?? null;
  const estimatedActiveSubscribers = Math.min(
    releasedSubscribersCount,
    Math.round(Number(cumulativeAvgViewsUplift || 0)),
  );
  const activationRate =
    releasedSubscribersCount > 0
      ? (estimatedActiveSubscribers / releasedSubscribersCount) * 100
      : null;

  return {
    batchesCount: sortedBatches.length,
    latestBatch: latestBatch
      ? {
          id: latestBatch.id,
          status: latestBatch.status,
          detectionMode: latestBatch.detectionMode,
          dataQuality: latestBatch.dataQuality,
          dataQualityReason: latestBatch.dataQualityReason,
          analysisStartedAt: latestBatch.analysisStartedAt,
          firstObservedAt: latestBatch.firstObservedAt,
          endedAt: latestBatch.endedAt,
          releasedSubscribersCount,
          baselineMethod: latestBatch.baselineMethod,
          baselineAvgViews: latestBatch.baselineAvgViews,
          currentAvgViews: latestPoint?.avgViews ?? null,
          cumulativeAvgViewsUplift,
          incrementalAvgViewsUplift,
          estimatedActiveSubscribers:
            cumulativeAvgViewsUplift != null
              ? estimatedActiveSubscribers
              : null,
          activationRate,
          trackedPostsCount: latestPoint?.trackedPostsCount ?? 0,
          originalTrackedPostsCount: latestBatch.trackedPostsCount,
          lastCollectedAt: latestPoint?.collectedAt ?? null,
        }
      : null,
    points,
  };
}

function primaryAdmissionBatch(batches: Array<any>) {
  return batches.reduce<any | null>((primary, batch) => {
    if (!primary) return batch;
    const primarySize = Number(primary.releasedSubscribersCount || 0);
    const batchSize = Number(batch.releasedSubscribersCount || 0);
    if (batchSize !== primarySize)
      return batchSize > primarySize ? batch : primary;
    return new Date(batch.startedAt).getTime() <
      new Date(primary.startedAt).getTime()
      ? batch
      : primary;
  }, null);
}

export class AdCampaignAdmissionViewRead {
  private admissionAnalyticsStorageState: 'unknown' | 'available' | 'missing' =
    'unknown';

  constructor(private readonly prisma: PrismaService) {}

  async preloadAdmissionViewAnalytics(
    workspaceId: string,
    campaignIds: string[],
    pointLimit = 30,
    campaignJoinedCounts = new Map<string, number>(),
  ) {
    if (!campaignIds.length)
      return new Map<string, ReturnType<typeof shapeAdmissionViewAnalytics>>();
    if (this.admissionAnalyticsStorageState === 'missing') {
      return new Map(
        campaignIds.map((id) => [
          id,
          shapeAdmissionViewAnalytics([], pointLimit),
        ]),
      );
    }
    let batches: any[] = [];
    try {
      batches = await this.prisma.adCampaignAdmissionBatch.findMany({
        where: { workspaceId, adCampaignId: { in: campaignIds } },
        orderBy: [{ adCampaignId: 'asc' }, { startedAt: 'desc' }],
        include: {
          viewSnapshots: {
            orderBy: { collectedAt: 'desc' },
            take: pointLimit,
          },
        },
      });
      this.admissionAnalyticsStorageState = 'available';
    } catch (error) {
      if (!isCampaignStorageMissing(error)) throw error;
      this.admissionAnalyticsStorageState = 'missing';
      return new Map(
        campaignIds.map((id) => [
          id,
          shapeAdmissionViewAnalytics([], pointLimit),
        ]),
      );
    }
    const byCampaignId = new Map<string, any[]>();
    for (const batch of batches) {
      const list = byCampaignId.get(batch.adCampaignId) ?? [];
      list.push(batch);
      byCampaignId.set(batch.adCampaignId, list);
    }
    const result = new Map<
      string,
      ReturnType<typeof shapeAdmissionViewAnalytics>
    >();
    for (const id of campaignIds) {
      result.set(
        id,
        shapeAdmissionViewAnalytics(
          byCampaignId.get(id) ?? [],
          pointLimit,
          campaignJoinedCounts.get(id) ?? null,
        ),
      );
    }
    return result;
  }

  async admissionViewAnalytics(workspaceId: string, id: string) {
    const campaign = await this.prisma.adCampaign.findFirst({
      where: { id, workspaceId },
      select: { id: true, title: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    let batches: any[] = [];
    if (this.admissionAnalyticsStorageState !== 'missing') {
      try {
        batches = await this.prisma.adCampaignAdmissionBatch.findMany({
          where: { workspaceId, adCampaignId: id },
          orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
          include: {
            viewSnapshots: {
              orderBy: { collectedAt: 'asc' },
            },
          },
        });
        this.admissionAnalyticsStorageState = 'available';
      } catch (error) {
        if (!isCampaignStorageMissing(error)) throw error;
        this.admissionAnalyticsStorageState = 'missing';
      }
    }
    return {
      campaign,
      ...shapeAdmissionViewAnalytics(batches, 500),
      batches: batches.map((batch) => {
        const latestPoint = [...batch.viewSnapshots].sort(
          (a, b) =>
            new Date(b.collectedAt).getTime() -
            new Date(a.collectedAt).getTime(),
        )[0];
        return {
          id: batch.id,
          status: batch.status,
          detectionMode: batch.detectionMode,
          dataQuality: batch.dataQuality,
          dataQualityReason: batch.dataQualityReason,
          analysisStartedAt: batch.analysisStartedAt,
          firstObservedAt: batch.firstObservedAt,
          startedAt: batch.startedAt,
          endedAt: batch.endedAt,
          timeBoundarySource: batch.timeBoundarySource,
          releasedSubscribersCount: batch.releasedSubscribersCount,
          joinedBefore: batch.joinedBefore,
          joinedAfter: batch.joinedAfter,
          requestedBefore: batch.requestedBefore,
          requestedAfter: batch.requestedAfter,
          sourceLinks: batch.sourceLinks,
          baselineSnapshotAt: batch.baselineSnapshotAt,
          baselineMethod: batch.baselineMethod,
          trackedPosts: batch.trackedPosts,
          trackedPostsCount: latestPoint?.trackedPostsCount ?? 0,
          originalTrackedPostsCount: batch.trackedPostsCount,
          baselineAvgViews: batch.baselineAvgViews,
          baselineAvgReactions: batch.baselineAvgReactions,
          currentAvgViews: latestPoint?.avgViews ?? null,
          cumulativeAvgViewsUplift:
            latestPoint?.cumulativeAvgViewsUplift ?? null,
          incrementalAvgViewsUplift:
            latestPoint?.incrementalAvgViewsUplift ?? null,
          estimatedActiveSubscribers:
            latestPoint?.estimatedActiveSubscribers ?? null,
          activationRate: latestPoint?.activationRate ?? null,
          lastCollectedAt: latestPoint?.collectedAt ?? null,
          points: batch.viewSnapshots.map((point) => ({
            collectedAt: point.collectedAt,
            avgViews: point.avgViews,
            avgReactions: point.avgReactions,
            cumulativeAvgViewsUplift: point.cumulativeAvgViewsUplift,
            incrementalAvgViewsUplift: point.incrementalAvgViewsUplift,
            estimatedActiveSubscribers: point.estimatedActiveSubscribers,
            activationRate: point.activationRate,
            trackedPostsCount: point.trackedPostsCount,
            dataQuality: point.dataQuality,
            dataQualityReason: point.dataQualityReason,
          })),
        };
      }),
    };
  }
}
