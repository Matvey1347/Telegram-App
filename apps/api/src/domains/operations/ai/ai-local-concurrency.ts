import { Injectable, ServiceUnavailableException } from '@nestjs/common';

/** Singleton even when authorization makes its caller request scoped. No idle work. */
@Injectable()
export class AiLocalConcurrency {
  private active = 0;
  acquire(): () => void {
    if (this.active >= 8)
      throw new ServiceUnavailableException('AI_CAPACITY_EXHAUSTED');
    this.active++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active--;
      }
    };
  }
}
