import { randomUUID } from 'node:crypto';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import type { TelegramLeadChannelEvent } from './telegram-lead-channel.types';
export type TelegramLeadTransportEvent = {
  workspaceId: string;
  accountId: string;
} & (
  | { type: 'channel'; event: TelegramLeadChannelEvent }
  | { type: 'connected' | 'disconnected' | 'registry.changed' }
  | {
      type: 'recovery.started' | 'recovery.finished';
      sourceId: string;
      recoveryId: string;
      success?: boolean;
    }
);
/** One in-process stream from existing account handles, no connections/timer/storage. */
@Injectable()
export class TelegramLeadTransportEvents {
  constructor(@Optional() private readonly config?: ConfigService) {}
  get enabled() {
    return (
      this.config?.get<string>('INTERNAL_LEAD_DISCOVERY_ENABLED') === 'true'
    );
  }
  private readonly events = new Subject<TelegramLeadTransportEvent>();
  readonly stream = this.events.asObservable();
  refresh(workspaceId: string) {
    this.emit({ type: 'registry.changed', workspaceId, accountId: '' });
  }
  beginRecovery(identity: {
    workspaceId: string;
    accountId: string;
    sourceId: string;
  }) {
    const recoveryId = randomUUID();
    let finished = false;
    this.emit({ ...identity, type: 'recovery.started', recoveryId });
    return (success: boolean) => {
      if (finished) return;
      finished = true;
      this.emit({
        ...identity,
        type: 'recovery.finished',
        recoveryId,
        success,
      });
    };
  }
  emit(event: TelegramLeadTransportEvent) {
    this.events.next(event);
  }
}
