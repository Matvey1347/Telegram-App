import { ServiceUnavailableException } from '@nestjs/common';
/** No queue/retries. Timed-out SDK calls retain capacity until their real settlement. */
export class TelegramLeadReadLimiter {
  private static globalActive = 0;
  private active = 0;
  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= 2 || TelegramLeadReadLimiter.globalActive >= 8)
      return Promise.reject(
        new ServiceUnavailableException('LEAD_TELEGRAM_CAPACITY'),
      );
    this.active++;
    TelegramLeadReadLimiter.globalActive++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new ServiceUnavailableException('LEAD_TELEGRAM_TIMEOUT')),
        15_000,
      );
      const settled = () => {
        clearTimeout(timer);
        this.active--;
        TelegramLeadReadLimiter.globalActive--;
      };
      Promise.resolve()
        .then(operation)
        .then(
          (value) => {
            settled();
            resolve(value);
          },
          (error) => {
            settled();
            reject(
              error instanceof Error
                ? error
                : new Error('LEAD_TELEGRAM_READ_FAILED'),
            );
          },
        );
    });
  }
}
