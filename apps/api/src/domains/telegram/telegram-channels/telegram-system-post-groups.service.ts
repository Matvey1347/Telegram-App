import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramPostGroupStore } from './telegram-post-group.store';

export type TelegramSystemPostGroupOption = {
  id: string;
  title: string;
  isDefault: boolean;
};

@Injectable()
export class TelegramSystemPostGroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly groups: TelegramPostGroupStore,
  ) {}

  async optionsForSystemBotPost(userId: string, channelId: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: {
        id: channelId,
        workspaceId: membership.workspaceId,
        isActive: true,
        archivedAt: null,
      },
      select: { id: true, assignedMemberId: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const defaultGroup = await this.groups.ensureSystemBotPostsGroup(
      this.prisma,
      membership.workspaceId,
      channel.id,
      channel.assignedMemberId ?? membership.id,
    );
    const customGroups = await this.prisma.postGroup.findMany({
      where: {
        workspaceId: membership.workspaceId,
        telegramChannelId: channel.id,
        isSystem: false,
      },
      orderBy: [
        { sidebarPosition: 'asc' },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
      take: 99,
      select: { id: true, title: true },
    });
    return [
      { id: defaultGroup.id, title: defaultGroup.title, isDefault: true },
      ...customGroups.map((group) => ({ ...group, isDefault: false })),
    ] satisfies TelegramSystemPostGroupOption[];
  }
}
