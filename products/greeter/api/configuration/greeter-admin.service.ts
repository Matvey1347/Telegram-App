import { Injectable, NotFoundException } from '@nestjs/common';
import { TelegramBotApplicationType, WorkspaceRole } from '@prisma/client';
import { WorkspaceService } from '../../../../common/workspace.service';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class GreeterAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspaceService,
  ) {}

  async requireBot(userId: string, botId: string) {
    const membership = await this.workspaces.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
      WorkspaceRole.admin,
    ]);
    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: {
        id: botId,
        workspaceId: membership.workspaceId,
        applicationType: TelegramBotApplicationType.GREETER,
      },
      include: { runtimeInstances: true },
    });
    if (!bot) throw new NotFoundException('Greeter bot not found');
    return bot;
  }
}
