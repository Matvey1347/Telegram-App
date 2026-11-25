import { readAutopilotRunCosts } from './telegram-ai-posting-autopilot-costs';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MAX_TELEGRAM_AI_POSTING_BATCH_SIZE } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramAiPostingGeneratorService } from './telegram-ai-posting-generator.service';
import { TelegramAiPostingTestRunService } from './telegram-ai-posting-test-run.service';
import { TelegramManagedPostPublicationService } from './telegram-managed-post-publication.service';
import { TelegramPublicationSchedulesService } from './telegram-publication-schedules.service';
import { classifyAutopilotError } from './telegram-ai-posting-autopilot-error';
import {
  AUTOPILOT_COVERAGE_DAYS,
  AUTOPILOT_REFILL_DAYS,
  autopilotReadyDraftWhere,
  autopilotContentSlots,
  automaticPostingAiAvailable,
  readAutopilotCadence,
} from './telegram-ai-posting-autopilot-policy';
import { markTelegramAiPostingRunForReview } from './telegram-ai-posting-review-queue';

const DAY_MS = 86_400_000;
const MAX_SCHEDULE_PER_RUN = 40;

@Injectable()
export class TelegramAiPostingAutopilotChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generator: TelegramAiPostingGeneratorService,
    private readonly testRuns: TelegramAiPostingTestRunService,
    private readonly schedule: TelegramPublicationSchedulesService,
    private readonly publication: TelegramManagedPostPublicationService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}

  async run(
    workspaceId: string,
    telegramChannelId: string,
    runId: string,
    leaseOwner: string,
  ) {
    const now = new Date();
    const scope = { workspaceId, telegramChannelId };
    const leaseWhere = {
      ...scope,
      autopilotEnabled: true,
      autopilotLeaseOwner: leaseOwner,
    };
    const lease = () =>
      this.prisma.telegramAiPostingSettings.findFirst({
        where: {
          ...leaseWhere,
          autopilotLeaseExpiresAt: { gt: new Date() },
          telegramChannel: { isActive: true },
        },
        select: {
          id: true,
          mode: true,
          draftExpirationDays: true,
          autopilotLastSummary: true,
        },
      });
    const settings = await lease();
    let reviewDrafts: Parameters<typeof readAutopilotRunCosts>[4];
    const summary = {
      status: 'STOPPED',
      generated: 0,
      scheduled: 0,
      readyDrafts: 0,
      scheduledInWindow: 0,
      scheduledThrough: null as string | null,
      refillThrough: null as string | null,
      timezone: 'Europe/Warsaw',
      coverageDays: 0,
      targetCoverageDays: AUTOPILOT_REFILL_DAYS,
      criticalDraftThreshold: 0,
      scheduleMode: 'NO_SCHEDULE',
      nextCheckHours: 24,
      errors: [] as string[],
      costs: {} as Record<string, string>,
      unknownCosts: 0,
      spheres: [] as string[],
      rubrics: [] as string[],
      channelTitle: '',
    };
    if (!settings) return summary;
    const [actor, cadence, channel] = await Promise.all([
      this.prisma.workspaceMember.findFirst({
        where: {
          workspaceId,
          OR: [{ role: 'owner' }, { roleDefinition: { systemKey: 'OWNER' } }],
        },
        orderBy: { id: 'asc' },
        select: { userId: true },
      }),
      readAutopilotCadence(this.prisma, scope),
      this.prisma.telegramChannel.findFirst({
        where: { id: telegramChannelId, workspaceId, isActive: true },
        select: { title: true },
      }),
    ]);
    summary.channelTitle = channel?.title ?? '';
    if (!actor) throw new Error('AI_POSTING_WORKSPACE_MEMBER_REQUIRED');
    if (!cadence.weeklySlotsMax) {
      summary.status = 'FAILED';
      summary.errors.push('PUBLICATION_PLAN_REQUIRED');
      return summary;
    }
    const userId = actor.userId;
    await this.authorization.require(userId, 'posts.manage');
    await this.authorization.require(userId, 'operations.executeAi');
    const reviewOnly = settings.mode === 'REVIEW';
    const draftWhere = autopilotReadyDraftWhere(
      scope,
      new Date(+now - settings.draftExpirationDays * DAY_MS),
    );
    const previous = settings.autopilotLastSummary;
    const pendingThrough =
      previous &&
      typeof previous === 'object' &&
      !Array.isArray(previous) &&
      typeof previous.refillThrough === 'string'
        ? Date.parse(previous.refillThrough)
        : 0;
    const threshold = +now + AUTOPILOT_REFILL_DAYS * DAY_MS;
    const horizon = +now + AUTOPILOT_COVERAGE_DAYS * DAY_MS;
    const through =
      pendingThrough >= threshold && pendingThrough <= horizon
        ? pendingThrough
        : horizon;
    const occurrences = await this.schedule.occurrencesByChannels(userId, {
      channelIds: telegramChannelId,
      from: now.toISOString(),
      to: new Date(through).toISOString(),
    });
    const content = autopilotContentSlots(occurrences[telegramChannelId] ?? []);
    const occupied = new Set(
      content
        .filter((slot) => slot.state === 'OCCUPIED')
        .map((slot) => slot.scheduledAt),
    );
    const available = content.filter((slot) => slot.state === 'AVAILABLE');
    summary.timezone = content[0]?.timezone ?? summary.timezone;
    const holes = available.some(
      (slot) => Date.parse(slot.scheduledAt) < threshold,
    );
    const vacancies =
      (holes || through === pendingThrough) && !reviewOnly ? available : [];
    const readyBefore = await this.prisma.telegramManagedPost.count({
      where: draftWhere,
    });
    summary.criticalDraftThreshold = Math.ceil(
      cadence.plannedPerDay * AUTOPILOT_REFILL_DAYS,
    );

    let stopped = false;
    const used = new Set<string>();
    const slots = vacancies.slice(0, MAX_SCHEDULE_PER_RUN);
    const attemptedSlots = new Set<string>();
    const fill = async (availableSlots: typeof slots, freshIds: string[] = []) => {
      const limit = availableSlots.length;
      if (limit <= 0) return;
      await this.stage(runId, 'SCHEDULE_DRAFTS', { vacantSlots: limit });
      const fresh = freshIds.slice(0, limit);
      const existing = fresh.length < limit
        ? await this.prisma.telegramManagedPost.findMany({
            where: { ...draftWhere, id: { notIn: [...used, ...fresh] } },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
            take: limit - fresh.length,
          })
        : [];
      const drafts = [...fresh, ...existing.map(({ id }) => id)];
      for (const [index, draft] of drafts.entries()) {
        if (!(await lease())) {
          stopped = true;
          break;
        }
        const slot = availableSlots[index];
        attemptedSlots.add(slot.scheduledAt);
        used.add(draft);
        try {
          const scheduled = await this.publication.scheduleManagedPost(
            userId,
            telegramChannelId,
            draft,
            {
              scheduledAt: slot.scheduledAt,
              publicationSlotId: slot.slotId,
              longTextMode: 'CAPTION_THEN_TEXT',
            },
          );
          occupied.add(slot.scheduledAt);
          summary.scheduleMode =
            summary.scheduleMode === 'NO_SCHEDULE' ||
            summary.scheduleMode === scheduled.scheduleMode
              ? (scheduled.scheduleMode ?? 'NO_SCHEDULE')
              : 'MIXED';
          summary.scheduled++;
        } catch (error) {
          summary.errors.push(classifyAutopilotError(error));
          break;
        }
      }
    };

    const canGenerate = (slots.length > 0 || readyBefore < cadence.targetReadyDrafts) &&
      await lease() &&
      await automaticPostingAiAvailable(this.prisma, workspaceId);
    // Keep capacity for fresh posts without waiting on AI to secure all slots.
    const freshSlotTarget = canGenerate && slots.length > 1
      ? Math.min(Math.floor(slots.length / 2), MAX_TELEGRAM_AI_POSTING_BATCH_SIZE)
      : 0;
    const reservedSlots = new Set(Array.from({ length: freshSlotTarget }, (_, index) =>
      slots[Math.floor((index + 0.5) * slots.length / freshSlotTarget)].scheduledAt));
    await fill(slots.filter(({ scheduledAt }) => !reservedSlots.has(scheduledAt)));
    const remaining = slots.filter((slot) => !attemptedSlots.has(slot.scheduledAt));
    const stockAfterScheduling = readyBefore - summary.scheduled;
    const requested = Math.max(0, cadence.targetReadyDrafts - stockAfterScheduling + remaining.length);
    const amount = reviewOnly ? Math.min(MAX_TELEGRAM_AI_POSTING_BATCH_SIZE, requested) : requested;
    if (amount && !summary.errors.length && !stopped && (await lease())) {
      if (!canGenerate) {
        summary.errors.push('AI_AUTOMATIC_DISABLED');
      } else {
        const freshIds: string[] = [];
        try {
          await this.stage(runId, 'GENERATE_DRAFTS', {
            requested: amount,
            stockTarget: cadence.targetReadyDrafts,
          });
          // Reuse the bounded generator under the same channel lease and report.
          // Count attempted slots so a provider outage cannot trigger an open-ended retry loop.
          for (let attempted = 0; attempted < amount; ) {
            if (!(await lease())) {
              stopped = true;
              break;
            }
            const count = Math.min(MAX_TELEGRAM_AI_POSTING_BATCH_SIZE, amount - attempted);
            attempted += count;
            const generated = await this.generator.generate(userId, telegramChannelId, count, 'AUTOMATIC', runId);
            if (reviewOnly) reviewDrafts = {
              testRunId: generated.runId,
              indices: generated.generated.flatMap((item) =>
                item.mediaReadiness === 'READY' && item.imageUrl ? [item.publicationIndex] : []),
            };
            let version = generated.version;
            for (const [index, item] of generated.generated.entries()) {
              if (reviewOnly || item.mediaReadiness !== 'READY' || !item.imageUrl)
                continue;
              if (!(await lease())) {
                stopped = true;
                break;
              }
              const approved = await this.testRuns.reviewPublication(
                userId,
                telegramChannelId,
                generated.runId,
                index,
                version,
                'approve',
              );
              version = approved.version;
              const saved = await this.testRuns.reviewPublication(
                userId,
                telegramChannelId,
                generated.runId,
                index,
                version,
                'save',
              );
              version = saved.version;
              const savedPostId = saved.publications?.[index]?.savedPostId;
              if (savedPostId) {
                freshIds.push(savedPostId);
                summary.generated++;
                if (item.editorialMetadata?.sphere?.name)
                  summary.spheres.push(item.editorialMetadata.sphere.name);
                if (item.editorialMetadata?.rubric?.name)
                  summary.rubrics.push(item.editorialMetadata.rubric.name);
              }
            }
            if (reviewOnly)
              await markTelegramAiPostingRunForReview(
                this.prisma,
                workspaceId,
                generated.runId,
              );
            const failures = generated.failures.map(({ code }) => classifyAutopilotError(new Error(code)));
            summary.errors.push(...failures);
            if (stopped || reviewOnly || failures.includes('AI_BUDGET_OR_QUOTA') ||
                !generated.generated.some((item) => item.mediaReadiness === 'READY' && item.imageUrl))
              break;
          }
        } catch (error) {
          summary.errors.push(classifyAutopilotError(error));
        }
        if (!stopped && !summary.errors.includes('SLOT_CONFLICT')) {
          const freshSlots = remaining.filter((slot) => reservedSlots.has(slot.scheduledAt)).slice(0, freshIds.length);
          const remainingSlots = remaining.filter((slot) => !freshSlots.includes(slot));
          await fill([...freshSlots, ...remainingSlots], freshIds);
        }
      }
    }
    summary.readyDrafts = await this.prisma.telegramManagedPost.count({
      where: draftWhere,
    });
    summary.scheduledInWindow = occupied.size;
    summary.scheduledThrough = [...occupied].sort().at(-1) ?? null;
    const firstGap = content.find((slot) => !occupied.has(slot.scheduledAt));
    summary.coverageDays = firstGap
      ? Math.max(
          0,
          Math.floor((Date.parse(firstGap.scheduledAt) - +now) / DAY_MS),
        )
      : AUTOPILOT_COVERAGE_DAYS;
    if (vacancies.some((slot) => !occupied.has(slot.scheduledAt)))
      summary.refillThrough = new Date(through).toISOString();
    summary.errors = [...new Set(summary.errors)];
    summary.status = stopped
      ? 'STOPPED'
      : summary.errors.length
        ? 'PARTIAL'
        : summary.coverageDays < AUTOPILOT_REFILL_DAYS
          ? 'CRITICAL_COVERAGE'
          : 'COMPLETED';
    summary.nextCheckHours = summary.errors.length
      ? 6
      : !reviewOnly &&
          (summary.readyDrafts < cadence.targetReadyDrafts ||
            summary.refillThrough !== null)
        ? 2
        : 24;
    summary.spheres = [...new Set(summary.spheres)];
    summary.rubrics = [...new Set(summary.rubrics)];
    return { ...summary, ...await readAutopilotRunCosts(this.prisma, workspaceId, telegramChannelId, runId, reviewDrafts) };
  }

  private async stage(
    runId: string,
    currentStage: string,
    metadata: Prisma.InputJsonObject,
  ) {
    await this.prisma.telegramAiPostingAutopilotRun.update({
      where: { id: runId },
      data: { currentStage },
    });
    await this.prisma.telegramAiPostingAutopilotStage.create({
      data: {
        runId,
        stage: currentStage,
        status: 'STARTED',
        attempt: 1,
        metadata,
      },
    });
  }
}
