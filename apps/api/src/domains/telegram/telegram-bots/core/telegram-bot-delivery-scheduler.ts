const MAX_TIMER_DELAY_MS = 2_147_483_647;
const NO_PROGRESS_MIN_BACKOFF_MS = 5_000;
const NO_PROGRESS_MAX_BACKOFF_MS = 15 * 60_000;
const SCHEDULER_ERROR_RETRY_DELAY_MS = 5_000;

type DeliverySchedulerOptions = {
  batchSize: number;
  findNextDueAt: () => Promise<Date | null>;
  processDue: () => Promise<number>;
  onError: (context: string, error: unknown) => void;
};

/** Maintains one in-process wake-up for the next persisted delivery. */
export class TelegramBotDeliveryScheduler {
  private wakeTimer?: NodeJS.Timeout;
  private wakeAt?: number;
  private timerGeneration = 0;
  private scheduleRevision = 0;
  private processing?: Promise<void>;
  private destroyed = false;
  private noProgressAttempts = 0;

  constructor(private readonly options: DeliverySchedulerOptions) {}

  async bootstrap() {
    await this.reschedule().catch((error) => {
      this.options.onError('bootstrap', error);
      this.armWake(new Date(Date.now() + SCHEDULER_ERROR_RETRY_DELAY_MS));
    });
  }

  destroy() {
    this.destroyed = true;
    this.timerGeneration += 1;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = undefined;
    this.wakeAt = undefined;
  }

  notify(dueAt: Date) {
    this.noProgressAttempts = 0;
    this.scheduleRevision += 1;
    this.armWake(dueAt);
  }

  async reschedule(notBefore?: Date) {
    const revision = ++this.scheduleRevision;
    const nextDueAt = await this.options.findNextDueAt();
    if (revision !== this.scheduleRevision || this.destroyed) return;
    const dueAt =
      nextDueAt && notBefore && nextDueAt < notBefore ? notBefore : nextDueAt;
    this.replaceWake(dueAt);
  }

  private replaceWake(dueAt: Date | null) {
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = undefined;
    this.wakeAt = undefined;
    this.timerGeneration += 1;
    if (dueAt) this.armWake(dueAt);
  }

  private armWake(dueAt: Date) {
    if (this.destroyed) return;
    const target = dueAt.getTime();
    if (this.wakeTimer && this.wakeAt !== undefined && this.wakeAt <= target)
      return;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    const generation = ++this.timerGeneration;
    this.wakeAt = target;
    this.wakeTimer = setTimeout(
      () => this.handleWake(generation, target),
      Math.min(Math.max(0, target - Date.now()), MAX_TIMER_DELAY_MS),
    );
    this.wakeTimer.unref?.();
  }

  private handleWake(generation: number, target: number) {
    if (generation !== this.timerGeneration || this.destroyed) return;
    this.wakeTimer = undefined;
    this.wakeAt = undefined;
    if (target > Date.now()) {
      this.armWake(new Date(target));
      return;
    }
    void this.runDueCycle();
  }

  private runDueCycle() {
    if (this.processing) return this.processing;
    const cycle = this.drainDueDeliveries().finally(() => {
      if (this.processing === cycle) this.processing = undefined;
    });
    this.processing = cycle;
    return cycle;
  }

  private async drainDueDeliveries() {
    try {
      let claimed = 0;
      let batchSize: number;
      do {
        batchSize = await this.options.processDue();
        claimed += batchSize;
      } while (batchSize === this.options.batchSize);
      if (claimed) {
        this.noProgressAttempts = 0;
        await this.reschedule();
        return;
      }
      this.noProgressAttempts += 1;
      const delay = Math.min(
        NO_PROGRESS_MAX_BACKOFF_MS,
        NO_PROGRESS_MIN_BACKOFF_MS * 2 ** (this.noProgressAttempts - 1),
      );
      await this.reschedule(new Date(Date.now() + delay));
    } catch (error) {
      this.options.onError('scheduler', error);
      this.scheduleRevision += 1;
      this.replaceWake(new Date(Date.now() + SCHEDULER_ERROR_RETRY_DELAY_MS));
    }
  }
}
