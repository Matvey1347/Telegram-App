import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import type { CrmRealtimeEvent } from '@telegram-system/shared';
import { filter, map, type Observable } from 'rxjs';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';

@UseGuards(JwtAuthGuard)
@Controller('telegram-crm/events')
export class TelegramCrmEventsController {
  constructor(
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly events: TelegramCrmEventHub,
  ) {}

  @Sse('stream')
  async stream(
    @CurrentUser() user: JwtUser,
  ): Promise<Observable<MessageEvent>> {
    const access = await this.authorization.require(
      user.sub,
      'adSales.crm.view',
    );
    const scope = await this.authorization.scope(
      user.sub,
      'adSales.crm.viewOwn',
      'adSales.crm.viewAny',
    );
    return this.events.workspace(access.workspaceId).pipe(
      filter((event) => this.visible(event, scope)),
      map((event) => ({ type: event.type, data: event })),
    );
  }

  private visible(
    event: CrmRealtimeEvent,
    scope: Record<string, never> | { assignedMemberId: string },
  ) {
    if (!('assignedMemberId' in scope)) return true;
    if (event.type === 'inbox.updated') return false;
    return event.ownerMemberId === scope.assignedMemberId;
  }
}
