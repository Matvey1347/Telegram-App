import {
  Body,
  Controller,
  Delete,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { filter, map, type Observable } from 'rxjs';
import { CurrentUser } from '../../../common/current-user.decorator';
import type { JwtUser } from '../../../common/current-user.decorator';
import { JwtAuthGuard } from '../../../common/jwt-auth.guard';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  MarkVisibleNotificationsDto,
  OperationsNotificationsQueryDto,
  OperationsPushSubscriptionDto,
  OperationsPushUnsubscribeDto,
  UpdateNotificationPreferencesDto,
} from './operations-notifications.dto';
import { OperationsNotificationEventHub } from './operations-notification-event-hub.service';
import { OperationsNotificationsService } from './operations-notifications.service';
import { OperationsNotificationPermissionService } from './operations-notification-permission.service';

@UseGuards(JwtAuthGuard)
@Controller('operations/notifications')
export class OperationsNotificationsController {
  constructor(
    private readonly service: OperationsNotificationsService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly events: OperationsNotificationEventHub,
    private readonly permissions: OperationsNotificationPermissionService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: JwtUser,
    @Query() query: OperationsNotificationsQueryDto,
  ) {
    return this.service.list(user.sub, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: JwtUser) {
    return this.service.unreadCount(user.sub);
  }

  @Post(':id/read')
  markOne(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.service.markOne(user.sub, id);
  }

  @Post('read-visible')
  markVisible(
    @CurrentUser() user: JwtUser,
    @Body() dto: MarkVisibleNotificationsDto,
  ) {
    return this.service.markVisible(user.sub, dto.ids);
  }

  @Post('read-all')
  markAll(@CurrentUser() user: JwtUser) {
    return this.service.markAll(user.sub);
  }

  @Get('preferences')
  preferences(@CurrentUser() user: JwtUser) {
    return this.service.preferences(user.sub);
  }

  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateNotificationPreferencesDto,
  ) {
    return this.service.updatePreferences(user.sub, dto.webPushEnabled);
  }

  @Get('push/config')
  pushConfig(@CurrentUser() user: JwtUser) {
    return this.service.pushPublicConfig(user.sub);
  }

  @Post('push/subscriptions')
  subscribe(
    @CurrentUser() user: JwtUser,
    @Body() dto: OperationsPushSubscriptionDto,
  ) {
    return this.service.subscribe(user.sub, dto);
  }

  @Delete('push/subscriptions')
  unsubscribe(
    @CurrentUser() user: JwtUser,
    @Body() dto: OperationsPushUnsubscribeDto,
  ) {
    return this.service.unsubscribe(user.sub, dto.endpoint);
  }

  @Sse('events/stream')
  async stream(
    @CurrentUser() user: JwtUser,
  ): Promise<Observable<MessageEvent>> {
    const access = await this.authorization.require(
      user.sub,
      'operations.notifications',
    );
    return this.events.member(access.workspaceId, access.memberId).pipe(
      filter(
        (event) =>
          event.type === 'notifications.invalidated' ||
          this.permissions.sourceVisible(
            access.permissionKeys,
            access.memberId,
            event,
          ),
      ),
      map((event) => ({
        type: event.type,
        data:
          event.type === 'notifications.invalidated'
            ? event
            : {
                type: event.type,
                workspaceId: event.workspaceId,
                recipientMemberId: event.recipientMemberId,
                occurredAt: event.occurredAt,
                notification: event.notification,
              },
      })),
    );
  }
}
