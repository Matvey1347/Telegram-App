import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export type TelegramAccountRuntimeChange = {
  workspaceId: string;
  accountId: string;
  reason: 'capability' | 'credentials' | 'login' | 'removed' | 'revoked';
};

/** Process-local control signal only. It performs no polling or persistence. */
@Injectable()
export class TelegramAccountRuntimeNotifier {
  private readonly changes = new Subject<TelegramAccountRuntimeChange>();

  readonly stream = this.changes.asObservable();

  wake(change: TelegramAccountRuntimeChange) {
    this.changes.next(change);
  }
}
