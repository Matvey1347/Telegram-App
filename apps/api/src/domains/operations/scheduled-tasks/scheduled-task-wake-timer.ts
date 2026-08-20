import { PrismaService } from '../../../prisma/prisma.service';

const MAX_TIMER_DELAY_MS = 2_147_483_647;

export class ScheduledTaskWakeTimer {
  private timer?: NodeJS.Timeout;
  private generation = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly onWake: () => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  destroy() {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async scheduleNext() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const scheduleGeneration = ++this.generation;
    const now = new Date();
    const [ready, claimed] = await Promise.all([
      this.prisma.scheduledTaskConfig.findFirst({
        where: {
          enabled: true,
          nextScheduledRunAt: { not: null },
          OR: [
            { scheduledClaimOwner: null },
            { scheduledClaimExpiresAt: null },
            { scheduledClaimExpiresAt: { lte: now } },
          ],
        },
        orderBy: { nextScheduledRunAt: 'asc' },
        select: { nextScheduledRunAt: true },
      }),
      this.prisma.scheduledTaskConfig.findFirst({
        where: {
          enabled: true,
          nextScheduledRunAt: { not: null },
          scheduledClaimOwner: { not: null },
          scheduledClaimExpiresAt: { gt: now },
        },
        orderBy: { scheduledClaimExpiresAt: 'asc' },
        select: {
          nextScheduledRunAt: true,
          scheduledClaimExpiresAt: true,
        },
      }),
    ]);
    if (scheduleGeneration !== this.generation) return;
    const readyAt = ready?.nextScheduledRunAt ?? null;
    const claimedAt = claimed?.scheduledClaimExpiresAt
      ? new Date(
          Math.max(
            claimed.nextScheduledRunAt?.getTime() ?? 0,
            claimed.scheduledClaimExpiresAt.getTime(),
          ),
        )
      : null;
    const nextAt = earliest([readyAt, claimedAt]);
    if (nextAt) this.armAt(nextAt.getTime());
  }

  armRecovery(delayMs: number) {
    this.replaceTimer(delayMs, () => this.runWake());
  }

  private armAt(target: number) {
    this.replaceTimer(
      Math.min(Math.max(0, target - Date.now()), MAX_TIMER_DELAY_MS),
      () => {
        if (target > Date.now()) {
          this.armAt(target);
        } else {
          this.runWake();
        }
      },
    );
  }

  private replaceTimer(delay: number, callback: () => void) {
    if (this.timer) clearTimeout(this.timer);
    const generation = ++this.generation;
    this.timer = setTimeout(() => {
      if (generation !== this.generation) return;
      this.timer = undefined;
      callback();
    }, delay);
    this.timer.unref?.();
  }

  private runWake() {
    void this.onWake().catch(this.onError);
  }
}

function earliest(values: Array<Date | null | undefined>) {
  const candidates = values.filter((value): value is Date => Boolean(value));
  return candidates.length
    ? new Date(Math.min(...candidates.map((value) => value.getTime())))
    : null;
}
