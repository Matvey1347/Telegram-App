import { ConflictException, Injectable } from '@nestjs/common';
import type {
  OperationsNotificationPreferences,
  OperationsNotificationPreferencesPatch,
} from '@telegram-system/shared';
import { CRM_NOTIFICATION_PREFERENCE_DEFAULTS } from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { OperationsPushSubscriptionDto } from './operations-notifications.dto';
import { OperationsWebPushConfigService } from './operations-web-push-config.service';
import { OPERATIONS_PUSH_MAX_ACTIVE_DEVICES } from './operations-notification-policy';

const preferenceSelect = {
  webPushEnabled: true,
  crmNotificationsEnabled: true,
  crmIncomingMessagesEnabled: true,
  crmFollowUpEnabled: true,
  crmAiLeadsEnabled: true,
  crmMessagePreviewEnabled: true,
  channelRemindersPushEnabled: true,
  channelRemindersTelegramEnabled: true,
} as const;
const defaults = {
  webPushEnabled: false,
  channelRemindersPushEnabled: false,
  channelRemindersTelegramEnabled: false,
  ...CRM_NOTIFICATION_PREFERENCE_DEFAULTS,
};

@Injectable()
export class OperationsNotificationPreferencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly pushConfig: OperationsWebPushConfigService,
  ) {}

  async preferences(
    userId: string,
  ): Promise<OperationsNotificationPreferences> {
    const access = await this.access(userId);
    const [preference, activeSubscriptionCount] = await Promise.all([
      this.prisma.operationsNotificationPreference.findUnique({
        where: {
          workspaceId_memberId: {
            workspaceId: access.workspaceId,
            memberId: access.memberId,
          },
        },
        select: preferenceSelect,
      }),
      this.prisma.operationsPushSubscription.count({
        where: { userId, active: true },
      }),
    ]);
    return {
      ...defaults,
      ...preference,
      pushConfigured: this.pushConfig.get().enabled,
      activeSubscriptionCount,
    };
  }

  async updatePreferences(
    userId: string,
    input: boolean | OperationsNotificationPreferencesPatch,
  ) {
    const access = await this.access(userId);
    const patch =
      typeof input === 'boolean' ? { webPushEnabled: input } : input;
    const key = { workspaceId: access.workspaceId, memberId: access.memberId };
    const current =
      await this.prisma.operationsNotificationPreference.findUnique({
        where: { workspaceId_memberId: key },
        select: preferenceSelect,
      });
    const effective = { ...defaults, ...current };
    const changes = Object.fromEntries(
      Object.entries(patch).filter(
        ([field, value]) =>
          field in defaults &&
          typeof value === 'boolean' &&
          effective[field as keyof typeof defaults] !== value,
      ),
    );
    if (Object.keys(changes).length) {
      if (current)
        await this.prisma.operationsNotificationPreference.update({
          where: { workspaceId_memberId: key },
          data: changes,
        });
      else
        await this.prisma.operationsNotificationPreference.upsert({
          where: { workspaceId_memberId: key },
          create: { ...key, ...changes },
          update: changes,
        });
    }
    return this.preferences(userId);
  }

  async subscribe(userId: string, dto: OperationsPushSubscriptionDto) {
    await this.access(userId);
    await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `operations-push-user:${userId}`,
      );
      const current = await tx.operationsPushSubscription.findUnique({
        where: { endpoint: dto.endpoint },
        select: {
          userId: true,
          p256dh: true,
          auth: true,
          userAgent: true,
          active: true,
        },
      });
      if (current && current.userId !== userId) {
        throw new ConflictException('Push endpoint belongs to another User');
      }
      if (!current || !current.active) {
        const activeCount = await tx.operationsPushSubscription.count({
          where: { userId, active: true },
        });
        if (activeCount >= OPERATIONS_PUSH_MAX_ACTIVE_DEVICES) {
          throw new ConflictException(
            `A User can have at most ${OPERATIONS_PUSH_MAX_ACTIVE_DEVICES} active push devices`,
          );
        }
      }
      const nextAgent = dto.userAgent ?? null;
      if (!current) {
        await tx.operationsPushSubscription.create({
          data: {
            userId,
            endpoint: dto.endpoint,
            p256dh: dto.keys.p256dh,
            auth: dto.keys.auth,
            userAgent: nextAgent,
          },
        });
      } else if (
        !current.active ||
        current.p256dh !== dto.keys.p256dh ||
        current.auth !== dto.keys.auth ||
        current.userAgent !== nextAgent
      ) {
        await tx.operationsPushSubscription.update({
          where: { endpoint: dto.endpoint },
          data: {
            p256dh: dto.keys.p256dh,
            auth: dto.keys.auth,
            userAgent: nextAgent,
            active: true,
            disabledAt: null,
          },
        });
      }
    });
    return this.preferences(userId);
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.access(userId);
    await this.prisma.operationsPushSubscription.updateMany({
      where: { userId, endpoint, active: true },
      data: { active: false, disabledAt: new Date() },
    });
    return this.preferences(userId);
  }

  pushPublicConfig(userId: string) {
    return this.access(userId).then(() => this.pushConfig.publicConfig());
  }

  private access(userId: string) {
    return this.authorization.require(userId, 'operations.notifications');
  }
}
