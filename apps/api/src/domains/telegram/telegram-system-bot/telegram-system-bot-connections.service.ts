import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  TelegramSystemBotConnectionStatus,
  TelegramSystemBotLinkPreview,
  TelegramSystemBotTaskSubscriptionsResponse,
  UpdateTelegramSystemBotGroupSubscriptionsPayload,
  TelegramSystemBotWorkspace,
  UpdateTelegramSystemBotSubscriptionPayload,
} from '@telegram-system/shared';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';
import { ScheduledTaskRegistryService } from '../../operations/scheduled-tasks/scheduled-task-registry.service';
import {
  SYSTEM_BOT_AUTHORIZED_CONNECTION_SELECT,
  SYSTEM_BOT_WORKSPACE_MEMBERSHIP_SELECT,
  presentSystemBotWorkspace,
  systemBotWorkspaceOption,
  type SystemBotAuthorizedConnection,
} from './telegram-system-bot-action-context';

type TelegramIdentity = {
  telegramUserId: string;
  telegramChatId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
};

type ConfirmedSystemBotLink = {
  status: TelegramSystemBotConnectionStatus;
  telegramChatId: string;
  telegramMessageId: number | null;
  connectionId: string;
};

@Injectable()
export class TelegramSystemBotConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TelegramSystemBotConfigService,
    private readonly taskRegistry: ScheduledTaskRegistryService,
  ) {}

  async createLink(identity: TelegramIdentity) {
    if (!this.config.frontendUrl) {
      throw new BadRequestException(
        'System bot connection URL is not configured',
      );
    }
    const plainToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const link = await this.prisma.systemBotLinkToken.create({
      data: {
        tokenHash: this.config.hashLinkToken(plainToken),
        telegramUserId: identity.telegramUserId,
        telegramChatId: identity.telegramChatId,
        username: identity.username,
        firstName: identity.firstName,
        expiresAt,
      },
    });
    return {
      id: link.id,
      url: `${this.config.frontendUrl}/system-bot/connect?token=${encodeURIComponent(plainToken)}`,
      expiresAt,
    };
  }

  async storeLinkMessage(linkId: string, telegramMessageId: number) {
    await this.prisma.systemBotLinkToken.updateMany({
      where: { id: linkId, usedAt: null, revokedAt: null },
      data: { telegramMessageId },
    });
  }

  async previewLink(
    userId: string,
    plainToken: string,
  ): Promise<TelegramSystemBotLinkPreview> {
    const token = await this.requireUsableToken(plainToken);
    const connection = await this.prisma.telegramSystemBotConnection.findUnique(
      {
        where: { telegramUserId: token.telegramUserId },
        select: { userId: true },
      },
    );
    if (connection && connection.userId !== userId) {
      throw new ConflictException(
        'This Telegram account is already connected to another user',
      );
    }
    return {
      expiresAt: token.expiresAt.toISOString(),
      telegramUsername: token.username ?? null,
      telegramFirstName: token.firstName ?? null,
    };
  }

  async confirmLink(
    userId: string,
    plainToken: string,
    selectedWorkspaceId: string,
  ): Promise<ConfirmedSystemBotLink> {
    const token = await this.requireUsableToken(plainToken);
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { workspaceId: true },
    });
    if (!memberships.length)
      throw new BadRequestException('User has no workspace');
    if (
      !memberships.some(
        (membership) => membership.workspaceId === selectedWorkspaceId,
      )
    ) {
      throw new NotFoundException('Workspace is no longer available');
    }
    const existing = await this.prisma.telegramSystemBotConnection.findUnique({
      where: { telegramUserId: token.telegramUserId },
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException(
        'This Telegram account is already connected to another user',
      );
    }
    const connection = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.systemBotLinkToken.updateMany({
        where: {
          id: token.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (consumed.count !== 1) {
        throw new ConflictException('Connection link has already been used');
      }
      return tx.telegramSystemBotConnection.upsert({
        where: { userId },
        create: {
          userId,
          telegramUserId: token.telegramUserId,
          telegramChatId: token.telegramChatId,
          username: token.username,
          firstName: token.firstName,
          currentWorkspaceId: selectedWorkspaceId,
          enabled: true,
          disconnectedAt: null,
        },
        update: {
          telegramUserId: token.telegramUserId,
          telegramChatId: token.telegramChatId,
          username: token.username,
          firstName: token.firstName,
          enabled: true,
          disconnectedAt: null,
          currentWorkspaceId: selectedWorkspaceId,
        },
      });
    });
    return {
      status: await this.status(userId),
      telegramChatId: token.telegramChatId,
      telegramMessageId: token.telegramMessageId,
      connectionId: connection.id,
    };
  }

  async status(userId: string): Promise<TelegramSystemBotConnectionStatus> {
    const connection = await this.prisma.telegramSystemBotConnection.findUnique(
      {
        where: { userId },
        include: { currentWorkspace: { select: { id: true, name: true } } },
      },
    );
    return {
      connected: Boolean(connection?.enabled),
      username: connection?.username ?? null,
      firstName: connection?.firstName ?? null,
      connectedAt: connection?.enabled
        ? connection.createdAt.toISOString()
        : null,
      currentWorkspaceId: connection?.currentWorkspaceId ?? null,
      currentWorkspaceName: connection?.currentWorkspace?.name ?? null,
      botUsername: this.config.username,
      runtimeEnvironment: this.config.environment,
    };
  }

  async disconnect(userId: string) {
    const connection = await this.prisma.telegramSystemBotConnection.findUnique(
      { where: { userId } },
    );
    if (!connection) return { success: true };
    await this.prisma.$transaction([
      this.prisma.telegramSystemBotTaskSubscription.deleteMany({
        where: { connectionId: connection.id },
      }),
      this.prisma.telegramSystemBotConnection.update({
        where: { id: connection.id },
        data: {
          enabled: false,
          disconnectedAt: new Date(),
          currentWorkspaceId: null,
        },
      }),
    ]);
    return { success: true };
  }

  async workspacesForConnection(
    connectionRef: string | SystemBotAuthorizedConnection,
  ): Promise<TelegramSystemBotWorkspace[]> {
    const connection = await this.resolveAuthorizedConnection(connectionRef);
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: connection.userId },
      orderBy: { createdAt: 'asc' },
      select: SYSTEM_BOT_WORKSPACE_MEMBERSHIP_SELECT,
    });
    return memberships.map((membership) =>
      systemBotWorkspaceOption(membership, connection.currentWorkspaceId),
    );
  }

  async switchWorkspace(
    connectionRef: string | SystemBotAuthorizedConnection,
    workspaceId: string,
  ) {
    const connection = await this.resolveAuthorizedConnection(connectionRef);
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId: connection.userId, workspaceId },
      select: { workspaceId: true },
    });
    if (!membership)
      throw new NotFoundException('Workspace is no longer available');
    await this.prisma.telegramSystemBotConnection.update({
      where: { id: connection.id },
      data: { currentWorkspaceId: workspaceId, lastInteractionAt: new Date() },
    });
    return { ...connection, currentWorkspaceId: workspaceId };
  }

  async switchWorkspaceForUser(userId: string, workspaceId: string) {
    const connection = await this.requireEnabledConnectionForUser(userId);
    await this.requireMembership(userId, workspaceId);
    if (connection.currentWorkspaceId === workspaceId) return;
    await this.prisma.telegramSystemBotConnection.update({
      where: { id: connection.id },
      data: { currentWorkspaceId: workspaceId, lastInteractionAt: new Date() },
    });
  }

  async workflowScopeForUser(userId: string, workspaceId: string) {
    const connection = await this.requireEnabledConnectionForUser(userId);
    await this.requireMembership(userId, workspaceId);
    return {
      connectionId: connection.id,
      workspaceId,
      userId,
      telegramUserId: connection.telegramUserId,
      chatId: connection.telegramChatId,
    };
  }

  async updateSubscription(
    userId: string,
    payload: UpdateTelegramSystemBotSubscriptionPayload,
  ) {
    const connection = await this.requireEnabledConnectionForUser(userId);
    await this.requireMembership(connection.userId, payload.workspaceId);
    this.requireNotifiableTask(payload.taskKey);
    const workspaceId = payload.workspaceId;
    return this.prisma.telegramSystemBotTaskSubscription.upsert({
      where: {
        connectionId_workspaceId_taskKey: {
          connectionId: connection.id,
          workspaceId,
          taskKey: payload.taskKey,
        },
      },
      create: { connectionId: connection.id, ...payload },
      update: payload,
    });
  }

  async updateGroupSubscriptions(
    userId: string,
    payload: UpdateTelegramSystemBotGroupSubscriptionsPayload,
  ) {
    const connection = await this.requireEnabledConnectionForUser(userId);
    await this.requireMembership(connection.userId, payload.workspaceId);
    const taskKeys = this.taskRegistry
      .definitions()
      .filter(
        (task) =>
          task.scope === 'WORKSPACE_OPERATION' &&
          task.notificationSupported &&
          task.group?.key === payload.groupKey,
      )
      .map((task) => task.key);
    if (!taskKeys.length) {
      throw new NotFoundException('Scheduled task group not found');
    }
    const enabled = payload.notifyOnSuccess || payload.notifyOnFailure;
    await this.prisma.$transaction(
      taskKeys.map((taskKey) =>
        this.prisma.telegramSystemBotTaskSubscription.upsert({
          where: {
            connectionId_workspaceId_taskKey: {
              connectionId: connection.id,
              workspaceId: payload.workspaceId,
              taskKey,
            },
          },
          create: {
            connectionId: connection.id,
            workspaceId: payload.workspaceId,
            taskKey,
            enabled,
            notifyOnSuccess: payload.notifyOnSuccess,
            notifyOnFailure: payload.notifyOnFailure,
          },
          update: {
            enabled,
            notifyOnSuccess: payload.notifyOnSuccess,
            notifyOnFailure: payload.notifyOnFailure,
          },
        }),
      ),
    );
    return this.subscriptions(userId, payload.workspaceId);
  }

  async subscriptions(
    userId: string,
    workspaceId: string,
  ): Promise<TelegramSystemBotTaskSubscriptionsResponse> {
    await this.requireMembership(userId, workspaceId);
    const definitions = this.taskRegistry
      .definitions()
      .filter(
        (task) =>
          task.scope === 'WORKSPACE_OPERATION' && task.notificationSupported,
      );
    const emptyItems = definitions.map((definition) => ({
      workspaceId,
      taskKey: definition.key,
      enabled: false,
      notifyOnSuccess: false,
      notifyOnFailure: false,
    }));
    const connection = await this.prisma.telegramSystemBotConnection.findFirst({
      where: { userId, enabled: true },
    });
    if (!connection) {
      return {
        connected: false,
        botUsername: this.config.username,
        workspaceId,
        items: emptyItems,
      };
    }
    const rows = await this.prisma.telegramSystemBotTaskSubscription.findMany({
      where: {
        connectionId: connection.id,
        workspaceId,
        taskKey: { in: definitions.map((task) => task.key) },
      },
    });
    const byKey = new Map(rows.map((row) => [row.taskKey, row]));
    return {
      connected: true,
      botUsername: this.config.username,
      workspaceId,
      items: emptyItems.map((item) => {
        const row = byKey.get(item.taskKey);
        return {
          ...item,
          enabled: row?.enabled ?? false,
          notifyOnSuccess: row?.notifyOnSuccess ?? false,
          notifyOnFailure: row?.notifyOnFailure ?? false,
        };
      }),
    };
  }

  async requireEnabledConnection(telegramUserId: string) {
    const connection = await this.prisma.telegramSystemBotConnection.findFirst({
      where: { telegramUserId, enabled: true },
    });
    if (!connection)
      throw new NotFoundException('Telegram account is not connected');
    return connection;
  }

  async requireCurrentWorkspace(
    connectionRef: string | SystemBotAuthorizedConnection,
  ) {
    const connection = await this.resolveAuthorizedConnection(connectionRef);
    if (!connection.currentWorkspaceId)
      throw new NotFoundException('Select a workspace first');
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId: connection.userId,
        workspaceId: connection.currentWorkspaceId,
      },
      select: SYSTEM_BOT_WORKSPACE_MEMBERSHIP_SELECT,
    });
    if (!membership)
      throw new NotFoundException('Workspace is no longer available');
    return presentSystemBotWorkspace(membership);
  }

  private resolveAuthorizedConnection(
    connectionRef: string | SystemBotAuthorizedConnection,
  ) {
    if (typeof connectionRef !== 'string') return connectionRef;
    return this.prisma.telegramSystemBotConnection.findUniqueOrThrow({
      where: { id: connectionRef },
      select: SYSTEM_BOT_AUTHORIZED_CONNECTION_SELECT,
    });
  }

  private async requireEnabledConnectionForUser(userId: string) {
    const connection = await this.prisma.telegramSystemBotConnection.findFirst({
      where: { userId, enabled: true },
    });
    if (!connection)
      throw new NotFoundException('Telegram System Bot is not connected');
    return connection;
  }

  private async requireMembership(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId },
      select: { workspaceId: true },
    });
    if (!membership)
      throw new NotFoundException('Workspace is no longer available');
    return membership;
  }

  private requireNotifiableTask(taskKey: string) {
    const definition = this.taskRegistry.get(taskKey);
    if (
      !definition ||
      definition.scope !== 'WORKSPACE_OPERATION' ||
      !definition.notificationSupported
    ) {
      throw new BadRequestException('Task does not support notifications');
    }
  }

  private async requireUsableToken(plainToken: string) {
    if (!plainToken || plainToken.length < 32)
      throw new BadRequestException('Invalid connection link');
    const token = await this.prisma.systemBotLinkToken.findUnique({
      where: { tokenHash: this.config.hashLinkToken(plainToken) },
    });
    if (!token || token.revokedAt || token.expiresAt <= new Date()) {
      throw new BadRequestException('Connection link has expired');
    }
    if (token.usedAt)
      throw new ConflictException('Connection link has already been used');
    return token;
  }
}
