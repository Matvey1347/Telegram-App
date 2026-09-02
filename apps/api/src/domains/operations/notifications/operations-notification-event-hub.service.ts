import { Injectable } from '@nestjs/common';
import type { OperationsNotificationRealtimeEvent } from '@telegram-system/shared';
import { filter, Observable, Subject } from 'rxjs';

export type OperationsNotificationEventEnvelope =
  | (Extract<
      OperationsNotificationRealtimeEvent,
      { type: 'notification.created' }
    > & {
      requiredPermissionKey: string | null;
      ownPermissionKey: string | null;
      anyPermissionKey: string | null;
      visibilityMemberId: string | null;
    })
  | Extract<
      OperationsNotificationRealtimeEvent,
      { type: 'notifications.invalidated' }
    >;

@Injectable()
export class OperationsNotificationEventHub {
  private readonly events = new Subject<OperationsNotificationEventEnvelope>();

  emit(event: OperationsNotificationEventEnvelope) {
    this.events.next(event);
  }

  member(
    workspaceId: string,
    recipientMemberId: string,
  ): Observable<OperationsNotificationEventEnvelope> {
    return this.events.pipe(
      filter(
        (event) =>
          event.workspaceId === workspaceId &&
          event.recipientMemberId === recipientMemberId,
      ),
    );
  }
}
