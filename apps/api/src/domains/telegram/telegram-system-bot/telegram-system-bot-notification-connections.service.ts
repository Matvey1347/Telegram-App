import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSystemBotConfigService } from './telegram-system-bot-config.service';

@Injectable()
export class TelegramSystemBotNotificationConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TelegramSystemBotConfigService,
  ) {}

  async notificationGroupStatus(workspaceId: string, userId: string) {
    await this.requireWorkspaceManager(workspaceId, userId);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        telegramNotificationChatId: true,
        telegramNotificationChatTitle: true,
      },
    });
    return {
      connected: Boolean(workspace.telegramNotificationChatId),
      chatTitle: workspace.telegramNotificationChatTitle,
      botUsername: this.config.username,
      runtimeEnvironment: this.config.environment,
      botRuntimes: this.config.dashboardRuntimes().map((runtime) => ({
        environment: runtime.environment,
        username: runtime.username,
        selected: runtime.selected,
      })),
    };
  }

  async createNotificationGroupLink(workspaceId: string, userId: string) {
    await this.requireWorkspaceManager(workspaceId, userId);
    this.requireConfiguredBot();
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        telegramNotificationLinkTokenHash: this.config.hashLinkToken(token),
        telegramNotificationLinkExpiresAt: expiresAt,
      },
    });
    return {
      token,
      botUsername: this.config.username!,
      expiresAt: expiresAt.toISOString(),
      botRuntimes: this.dashboardRuntimes(),
    };
  }

  async consumeNotificationGroupLink(
    token: string,
    chatId: string,
    chatTitle: string | undefined,
  ) {
    const tokenHash = this.config.hashLinkToken(token);
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        telegramNotificationLinkTokenHash: tokenHash,
        telegramNotificationLinkExpiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!workspace) return false;
    const linked = await this.prisma.workspace.updateMany({
      where: {
        id: workspace.id,
        telegramNotificationLinkTokenHash: tokenHash,
        telegramNotificationLinkExpiresAt: { gt: new Date() },
      },
      data: {
        telegramNotificationChatId: chatId,
        telegramNotificationChatTitle: chatTitle?.slice(0, 255) ?? null,
        telegramNotificationLinkTokenHash: null,
        telegramNotificationLinkExpiresAt: null,
      },
    });
    return linked.count === 1;
  }

  async disconnectNotificationGroup(workspaceId: string, userId: string) {
    await this.requireWorkspaceManager(workspaceId, userId);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        telegramNotificationChatId: null,
        telegramNotificationChatTitle: null,
        telegramNotificationLinkTokenHash: null,
        telegramNotificationLinkExpiresAt: null,
      },
    });
    return { success: true };
  }

  async notificationAccountStatus(workspaceId: string, userId: string) {
    await this.requireWorkspaceManager(workspaceId, userId);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: {
        telegramNotificationUserId: true,
        telegramNotificationUserChatId: true,
        telegramNotificationUserName: true,
      },
    });
    return {
      connected: Boolean(workspace.telegramNotificationUserChatId),
      telegramUserId: workspace.telegramNotificationUserId,
      telegramUsername: workspace.telegramNotificationUserName?.startsWith('@')
        ? workspace.telegramNotificationUserName.slice(1)
        : null,
      displayName: workspace.telegramNotificationUserName,
      botUsername: this.config.username,
      runtimeEnvironment: this.config.environment,
      botRuntimes: this.dashboardRuntimes(),
    };
  }

  async createNotificationAccountLink(workspaceId: string, userId: string) {
    await this.requireWorkspaceManager(workspaceId, userId);
    this.requireConfiguredBot();
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        telegramNotificationAccountLinkTokenHash:
          this.config.hashLinkToken(token),
        telegramNotificationAccountLinkExpiresAt: expiresAt,
        telegramNotificationAccountLinkTelegramUserId: null,
      },
    });
    return {
      token,
      botUsername: this.config.username!,
      expiresAt: expiresAt.toISOString(),
      runtimeEnvironment: this.config.environment,
      botRuntimes: this.dashboardRuntimes(),
    };
  }

  async consumeNotificationAccountLink(input: {
    token: string;
    telegramUserId: string;
    telegramChatId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }) {
    if (input.telegramUserId !== input.telegramChatId) return false;
    const tokenHash = this.config.hashLinkToken(input.token);
    const where = {
      telegramNotificationAccountLinkTokenHash: tokenHash,
      telegramNotificationAccountLinkExpiresAt: { gt: new Date() },
    };
    const workspace = await this.prisma.workspace.findFirst({
      where,
      select: {
        id: true,
        telegramNotificationAccountLinkTelegramUserId: true,
      },
    });
    if (!workspace) return false;
    if (workspace.telegramNotificationAccountLinkTelegramUserId)
      return (
        workspace.telegramNotificationAccountLinkTelegramUserId ===
        input.telegramUserId
      );

    const displayName = input.username
      ? `@${input.username}`
      : [input.firstName, input.lastName].filter(Boolean).join(' ') || null;
    const linked = await this.prisma.workspace.updateMany({
      where: {
        id: workspace.id,
        ...where,
        telegramNotificationAccountLinkTelegramUserId: null,
      },
      data: {
        telegramNotificationUserId: input.telegramUserId,
        telegramNotificationUserChatId: input.telegramChatId,
        telegramNotificationUserName: displayName,
        telegramNotificationAccountLinkTelegramUserId: input.telegramUserId,
      },
    });
    if (linked.count === 1) return true;

    // The same Telegram account may start dev and production bots at once.
    const afterRace = await this.prisma.workspace.findFirst({
      where,
      select: { telegramNotificationAccountLinkTelegramUserId: true },
    });
    return (
      afterRace?.telegramNotificationAccountLinkTelegramUserId ===
      input.telegramUserId
    );
  }

  async disconnectNotificationAccount(workspaceId: string, userId: string) {
    await this.requireWorkspaceManager(workspaceId, userId);
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        telegramNotificationUserId: null,
        telegramNotificationUserChatId: null,
        telegramNotificationUserName: null,
        telegramNotificationAccountLinkTokenHash: null,
        telegramNotificationAccountLinkExpiresAt: null,
        telegramNotificationAccountLinkTelegramUserId: null,
      },
    });
    return { success: true };
  }

  private requireConfiguredBot() {
    if (!this.config.configured || !this.config.username)
      throw new BadRequestException('System bot is not configured.');
  }

  private dashboardRuntimes() {
    return this.config.dashboardRuntimes().map((runtime) => ({
      environment: runtime.environment,
      username: runtime.username,
      selected: runtime.selected,
    }));
  }

  private async requireWorkspaceManager(workspaceId: string, userId: string) {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId, userId },
      select: { role: true },
    });
    if (!member) throw new NotFoundException('Workspace is not available.');
    if (member.role !== 'owner' && member.role !== 'admin')
      throw new ForbiddenException('Workspace management permission required.');
  }
}
