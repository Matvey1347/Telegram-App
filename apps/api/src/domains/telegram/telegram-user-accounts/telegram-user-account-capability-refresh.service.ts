import { Injectable, Optional } from '@nestjs/common';
import {
  OperationsNotificationPriority,
  OperationsNotificationType,
  TelegramUserAccountStatus,
  WorkspaceRole,
} from '@prisma/client';
import { TelegramAccountRuntimeNotifier } from '../../../common/telegram-account-runtime-notifier.service';
import { TokenEncryptionService } from '../../../common/security/token-encryption.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramMtprotoClient } from '@api/telegram/shared/mtproto/telegram-mtproto.client';
import { decryptTelegramMtprotoCredentials } from '@api/telegram/shared/mtproto/telegram-mtproto-credentials';
import {
  isRevokedTelegramSessionError,
  REVOKED_TELEGRAM_SESSION_MESSAGE,
  withTelegramTimeout,
} from '@api/telegram/shared/mtproto/telegram-session-errors';
import { ApplicationLoggerService } from '../../operations/application-logs/application-logger.service';
import { OperationsNotificationPublisherService } from '../../operations/notifications/operations-notification-publisher.service';
import { OperationsNotificationStoreService } from '../../operations/notifications/operations-notification-store.service';
import { TELEGRAM_ACCOUNT_CAPABILITY_CONFIG } from './telegram-capability.config';
import { telegramAccountCapabilityUpdate } from './telegram-user-account-login-finalizer';

export type TelegramCapabilityRefreshAccount = {
  id: string;
  workspaceId: string;
  label: string;
  assignedMemberId?: string | null;
  createdByUserId?: string | null;
  isActive?: boolean;
  status: TelegramUserAccountStatus;
  isPremium: boolean;
  premiumCheckedAt: Date | null;
  captionLengthMax: number;
  messageLengthMax: number;
  sessionEncrypted?: string | null;
  sessionIv?: string | null;
  sessionAuthTag?: string | null;
  apiId: string;
  apiHashEncrypted: string;
  apiHashIv: string;
  apiHashAuthTag: string;
};

@Injectable()
export class TelegramUserAccountCapabilityRefreshService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: TokenEncryptionService,
    private readonly mtproto: TelegramMtprotoClient,
    private readonly logger: ApplicationLoggerService,
    private readonly runtimeNotifier: TelegramAccountRuntimeNotifier,
    @Optional()
    private readonly notifications?: OperationsNotificationStoreService,
    @Optional()
    private readonly notificationPublisher?: OperationsNotificationPublisherService,
  ) {}

  async refreshOne(
    account: TelegramCapabilityRefreshAccount,
    options?: { force?: boolean },
  ) {
    if (account.status !== TelegramUserAccountStatus.connected) return null;
    if (!this.hasConnectedSession(account)) return null;
    if (!options?.force && !this.isStale(account)) return null;

    try {
      const profile = await withTelegramTimeout(
        this.mtproto.getAccountProfile(
          decryptTelegramMtprotoCredentials(this.encryption, {
            ...account,
            sessionEncrypted: account.sessionEncrypted!,
            sessionIv: account.sessionIv!,
            sessionAuthTag: account.sessionAuthTag!,
          }),
        ),
        TELEGRAM_ACCOUNT_CAPABILITY_CONFIG.checkTimeoutMs,
        `Telegram capability check for account ${account.id}`,
      );
      return await this.prisma.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          telegramUserId: profile.id,
          username: profile.username,
          firstName: profile.firstName,
          lastName: profile.lastName,
          photoUrl: profile.photoUrl ?? null,
          nameColor: profile.nameColor ?? null,
          label:
            (profile.username &&
              `@${String(profile.username).replace('@', '')}`) ||
            profile.firstName ||
            account.label,
          status: TelegramUserAccountStatus.connected,
          lastCheckedAt: new Date(),
          lastErrorMessage: null,
          ...telegramAccountCapabilityUpdate(profile),
        },
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      });
    } catch (error) {
      this.logger.writeStructured({
        level: 'warn',
        kind: 'integration',
        source: 'TelegramUserAccountsService',
        event: 'telegram.account_capabilities.refresh_failed',
        message:
          error instanceof Error
            ? error.message
            : 'Telegram account capability refresh failed',
        workspaceId: account.workspaceId,
        errorName: error instanceof Error ? error.name : 'Error',
        stack: error instanceof Error ? error.stack || null : null,
        metadata: { accountId: account.id, forced: Boolean(options?.force) },
      });
      if (!isRevokedTelegramSessionError(error)) return null;
      const updated = await this.prisma.telegramUserAccountIntegration.update({
        where: { id: account.id },
        data: {
          status: TelegramUserAccountStatus.error,
          lastCheckedAt: new Date(),
          lastErrorMessage: REVOKED_TELEGRAM_SESSION_MESSAGE,
        },
        include: {
          assignedMember: WorkspaceService.assignedMemberInclude,
          createdByUser: WorkspaceService.createdByUserInclude,
        },
      });
      this.runtimeNotifier.wake({
        workspaceId: account.workspaceId,
        accountId: account.id,
        reason: 'revoked',
      });
      await this.notifyReauthenticationRequired(updated);
      return updated;
    }
  }

  async refreshMany(rows: TelegramCapabilityRefreshAccount[]) {
    const pending = rows.filter(
      (row) =>
        row.status === TelegramUserAccountStatus.connected &&
        row.isActive !== false &&
        this.hasConnectedSession(row) &&
        this.isStale(row),
    );
    if (!pending.length) return new Map<string, unknown>();

    const updated = new Map<string, unknown>();
    let index = 0;
    const worker = async () => {
      while (index < pending.length) {
        const current = pending[index++];
        const refreshed = await this.refreshOne(current);
        if (refreshed) updated.set(current.id, refreshed);
      }
    };
    await Promise.all(
      Array.from(
        {
          length: Math.min(
            TELEGRAM_ACCOUNT_CAPABILITY_CONFIG.refreshConcurrency,
            pending.length,
          ),
        },
        () => worker(),
      ),
    );
    return updated;
  }

  private isStale(account: { premiumCheckedAt?: Date | null }) {
    if (!account.premiumCheckedAt) return true;
    const ttlMs = TELEGRAM_ACCOUNT_CAPABILITY_CONFIG.ttlHours * 60 * 60 * 1_000;
    return Date.now() - account.premiumCheckedAt.getTime() > ttlMs;
  }

  private hasConnectedSession(account: TelegramCapabilityRefreshAccount) {
    return Boolean(
      account.sessionEncrypted && account.sessionIv && account.sessionAuthTag,
    );
  }

  private async notifyReauthenticationRequired(account: {
    id: string;
    workspaceId: string;
    label: string;
    assignedMemberId: string | null;
    createdByUserId: string | null;
  }) {
    if (!this.notifications || !this.notificationPublisher) return;
    const creator = account.createdByUserId
      ? await this.prisma.workspaceMember.findFirst({
          where: {
            workspaceId: account.workspaceId,
            userId: account.createdByUserId,
          },
          select: { id: true },
        })
      : null;
    const owner =
      account.assignedMemberId || creator
        ? null
        : await this.prisma.workspaceMember.findFirst({
            where: {
              workspaceId: account.workspaceId,
              role: WorkspaceRole.owner,
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });
    const recipientMemberId =
      account.assignedMemberId ?? creator?.id ?? owner?.id;
    if (!recipientMemberId) return;

    const notificationIds = await this.prisma.$transaction((tx) =>
      this.notifications!.upsertMany(tx, [
        {
          workspaceId: account.workspaceId,
          recipientMemberId,
          type: OperationsNotificationType.TELEGRAM_ACCOUNT_REAUTH_REQUIRED,
          priority: OperationsNotificationPriority.HIGH,
          sourceKey: `telegram-account:${account.id}:reauth-required`,
          copyKey: 'telegram.notification.accountReauthRequired',
          title: 'Telegram account disconnected',
          body: `${account.label} needs to be reconnected via QR.`,
          metadata: { accountId: account.id, action: 'qr-login' },
          targetUrl: '/telegram-channels?tab=accounts&accountTab=mtproto',
        },
      ]),
    );
    await this.notificationPublisher.publish(
      notificationIds.map(({ id }) => id),
    );
  }
}
