import { authorizedCrmStream } from './telegram-crm-authorized-stream';
import { TelegramCrmStreamAccessService } from './telegram-crm-stream-access.service';
import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
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
    private readonly streamAccess: TelegramCrmStreamAccessService,
  ) {}

  @Sse('stream')
  async stream(
    @CurrentUser() user: JwtUser,
  ): Promise<Observable<MessageEvent>> {
    const access = await this.authorization.require(
      user.sub,
      'adSales.crm.view',
    );
    return authorizedCrmStream(
      this.events.workspace(access.workspaceId),
      (events) =>
        this.streamAccess.visible(user.sub, access.workspaceId, events),
    ).pipe(map((event) => ({ type: event.type, data: event })));
  }
}
