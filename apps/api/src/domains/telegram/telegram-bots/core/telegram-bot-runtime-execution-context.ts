import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

/** Carries the originating runtime through immediate, durable delivery enqueueing. */
@Injectable()
export class TelegramBotRuntimeExecutionContext {
  private readonly storage = new AsyncLocalStorage<string>();

  run<T>(runtimeId: string, callback: () => T): T {
    return this.storage.run(runtimeId, callback);
  }

  currentRuntimeId() {
    return this.storage.getStore() ?? null;
  }
}
