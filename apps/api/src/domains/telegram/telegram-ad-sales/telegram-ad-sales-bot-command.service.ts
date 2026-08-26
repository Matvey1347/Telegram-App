import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramAdSalesBotCommandExecutorService } from './telegram-ad-sales-bot-command-executor.service';
import { TelegramAdSalesService } from './telegram-ad-sales.service';
import type { TelegramAdSalesBotCommitInput } from './telegram-ad-sales-bot-command.types';
import { telegramAdSalesStandardProducts } from './telegram-ad-sales-bot-command-products';

export type {
  TelegramAdSalesBotCommitInput,
  TelegramAdSalesBotDeliveryAction,
  TelegramAdSalesBotPostInput,
} from './telegram-ad-sales-bot-command.types';

const OPTION_LIMIT = 100;

/**
 * Bot-neutral Ad Sales command boundary. Telegram presentation and workflow
 * state stay in the caller; this service owns scoped option reads and a
 * resumable invocation of the canonical Ad Sales use cases.
 */
@Injectable()
export class TelegramAdSalesBotCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
    private readonly sales: TelegramAdSalesService,
    private readonly executor: TelegramAdSalesBotCommandExecutorService,
  ) {}

  async options(userId: string, channelId?: string) {
    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const canAssignOthers =
      membership.role === WorkspaceRole.owner ||
      membership.role === WorkspaceRole.admin;
    const [accounts, members, channels] = await Promise.all([
      this.prisma.account.findMany({
        where: {
          workspaceId: membership.workspaceId,
          isActive: true,
          OR: [
            { assignedMemberId: null },
            { assignedMember: { isHidden: false } },
          ],
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        take: OPTION_LIMIT,
        select: {
          id: true,
          name: true,
          currency: true,
          icon: {
            select: {
              id: true,
              type: true,
              name: true,
              emoji: true,
              imageUrl: true,
            },
          },
          assignedMember: {
            select: {
              telegramUsername: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      }),
      this.prisma.workspaceMember.findMany({
        where: {
          workspaceId: membership.workspaceId,
          ...(canAssignOthers
            ? { OR: [{ isHidden: false }, { id: membership.id }] }
            : { id: membership.id }),
        },
        orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
        take: OPTION_LIMIT,
        select: {
          id: true,
          role: true,
          telegramUsername: true,
          user: { select: { name: true, email: true } },
        },
      }),
      this.prisma.telegramChannel.findMany({
        where: {
          workspaceId: membership.workspaceId,
          isActive: true,
          archivedAt: null,
        },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        take: OPTION_LIMIT,
        select: {
          id: true,
          title: true,
          username: true,
          photoUrl: true,
          adBaseCurrency: true,
        },
      }),
    ]);
    if (channelId && !channels.some((channel) => channel.id === channelId)) {
      throw new NotFoundException('Telegram channel not found');
    }
    const products = channelId
      ? telegramAdSalesStandardProducts(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- canonical service currently exposes an implicit product array type
          await this.sales.listChannelProducts(userId, channelId),
        )
      : [];
    const mappedMembers = members.map((member) => ({
      id: member.id,
      role: member.role,
      name:
        member.user.name ||
        member.telegramUsername ||
        member.user.email ||
        'Workspace member',
      telegramUsername: member.telegramUsername,
    }));
    const currentMember = mappedMembers.find(
      (member) => member.id === membership.id,
    );
    if (!currentMember) {
      throw new NotFoundException('Current workspace member not found');
    }
    return {
      workspace: {
        id: membership.workspaceId,
        timezone: membership.workspace.timezone,
      },
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        currency: account.currency,
        iconPresentation: iconToResolvedEmoji(account.icon),
        assignedMemberName:
          account.assignedMember?.user.name?.trim() ||
          account.assignedMember?.telegramUsername?.trim() ||
          account.assignedMember?.user.email?.trim() ||
          null,
      })),
      currentMember: { id: currentMember.id, name: currentMember.name },
      members: mappedMembers,
      channels,
      products,
    };
  }

  async commit(userId: string, input: TelegramAdSalesBotCommitInput) {
    return this.executor.commit(userId, input);
  }
}
