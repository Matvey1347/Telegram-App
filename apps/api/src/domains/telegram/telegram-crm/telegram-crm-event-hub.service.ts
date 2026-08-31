import { Injectable } from '@nestjs/common';
import type { CrmRealtimeEvent } from '@telegram-system/shared';
import { filter, Observable, Subject } from 'rxjs';

@Injectable()
export class TelegramCrmEventHub {
  private readonly events = new Subject<CrmRealtimeEvent>();

  emit(event: CrmRealtimeEvent) {
    this.events.next(event);
  }

  workspace(workspaceId: string): Observable<CrmRealtimeEvent> {
    return this.events.pipe(
      filter((event) => event.workspaceId === workspaceId),
    );
  }
}
