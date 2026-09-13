import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  TelegramChannelMessageTemplate,
  TelegramChannelMessageTemplatePayload,
  TelegramMessageTemplateSourceResponse,
} from '@telegram-system/shared';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import {
  TelegramChannelMessageTemplatePayloadDto,
  TelegramMessageTemplateSourceDto,
} from './dto';

const uniqueIds = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const templateInclude = {
  icon: true,
} satisfies Prisma.TelegramChannelMessageTemplateInclude;

type TemplateRow = Prisma.TelegramChannelMessageTemplateGetPayload<{
  include: typeof templateInclude;
}>;

@Injectable()
export class TelegramChannelMessageTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private shape(row: TemplateRow): TelegramChannelMessageTemplate {
    const overrides =
      row.inviteLinkOverrides &&
      typeof row.inviteLinkOverrides === 'object' &&
      !Array.isArray(row.inviteLinkOverrides)
        ? (row.inviteLinkOverrides as Record<string, string>)
        : {};
    return {
      id: row.id,
      title: row.title,
      iconId: row.iconId,
      iconPresentation: iconToResolvedEmoji(row.icon),
      scopeMode: row.scopeMode,
      networkId: row.networkId,
      channelIds: row.channelIds,
      bodyTemplate: row.bodyTemplate,
      overrideInviteLinks: row.overrideInviteLinks,
      inviteLinkOverrides: overrides,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async validatePayload(
    workspaceId: string,
    dto: TelegramChannelMessageTemplatePayloadDto,
  ): Promise<TelegramChannelMessageTemplatePayload> {
    const channelIds = uniqueIds(dto.channelIds);
    if (!channelIds.length) {
      throw new BadRequestException('Select at least one Telegram channel');
    }
    const channels = await this.prisma.telegramChannel.count({
      where: { workspaceId, id: { in: channelIds }, isActive: true },
    });
    if (channels !== channelIds.length) {
      throw new NotFoundException(
        'One or more Telegram channels are unavailable',
      );
    }
    const networkId = dto.networkId?.trim() || null;
    if (networkId) {
      const network = await this.prisma.telegramChannelNetwork.findFirst({
        where: { id: networkId, workspaceId },
        select: { id: true },
      });
      if (!network) throw new NotFoundException('Telegram network not found');
    }
    const iconId = dto.iconId?.trim() || null;
    if (iconId) {
      const icon = await this.prisma.icon.findFirst({
        where: {
          id: iconId,
          type: 'emoji',
          OR: [{ workspaceId }, { workspaceId: null }],
        },
        select: { id: true },
      });
      if (!icon) throw new NotFoundException('Emoji not found');
    }
    const links = Object.entries(dto.inviteLinkOverrides || {}).filter(
      ([channelId, linkId]) => channelIds.includes(channelId) && linkId,
    );
    if (links.length) {
      const validLinks = await this.prisma.telegramInviteLink.count({
        where: {
          workspaceId,
          isRevoked: false,
          OR: links.map(([telegramChannelId, id]) => ({
            id,
            telegramChannelId,
          })),
        },
      });
      if (validLinks !== links.length) {
        throw new BadRequestException(
          'One or more invite-link overrides are unavailable',
        );
      }
    }
    return {
      title: dto.title?.trim() || null,
      iconId,
      scopeMode: dto.scopeMode,
      networkId: dto.scopeMode === 'NETWORK' ? networkId : null,
      channelIds,
      bodyTemplate: dto.bodyTemplate,
      overrideInviteLinks: dto.overrideInviteLinks,
      inviteLinkOverrides: Object.fromEntries(links),
    };
  }

  async list(userId: string) {
    const workspaceId = await this.workspace(userId);
    const rows = await this.prisma.telegramChannelMessageTemplate.findMany({
      where: { workspaceId },
      include: templateInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    return rows.map((row) => this.shape(row));
  }

  async get(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const row = await this.prisma.telegramChannelMessageTemplate.findFirst({
      where: { id, workspaceId },
      include: templateInclude,
    });
    if (!row) throw new NotFoundException('Message template not found');
    return this.shape(row);
  }

  async create(userId: string, dto: TelegramChannelMessageTemplatePayloadDto) {
    const workspaceId = await this.workspace(userId);
    const payload = await this.validatePayload(workspaceId, dto);
    const row = await this.prisma.telegramChannelMessageTemplate.create({
      data: {
        ...payload,
        inviteLinkOverrides: payload.inviteLinkOverrides,
        workspaceId,
        createdByUserId: userId,
      },
      include: templateInclude,
    });
    return this.shape(row);
  }

  async update(
    userId: string,
    id: string,
    dto: TelegramChannelMessageTemplatePayloadDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.get(userId, id);
    const payload = await this.validatePayload(workspaceId, dto);
    const row = await this.prisma.telegramChannelMessageTemplate.update({
      where: { id },
      data: {
        ...payload,
        inviteLinkOverrides: payload.inviteLinkOverrides,
      },
      include: templateInclude,
    });
    return this.shape(row);
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const deleted = await this.prisma.telegramChannelMessageTemplate.deleteMany(
      { where: { id, workspaceId } },
    );
    if (!deleted.count)
      throw new NotFoundException('Message template not found');
    return { success: true };
  }

  async source(
    userId: string,
    dto: TelegramMessageTemplateSourceDto,
  ): Promise<TelegramMessageTemplateSourceResponse> {
    const workspaceId = await this.workspace(userId);
    const channelIds = uniqueIds(dto.channelIds);
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: channelIds }, isActive: true },
      select: {
        id: true,
        title: true,
        username: true,
        photoUrl: true,
        tgStatUrl: true,
        defaultInviteLinkId: true,
        presentationIcon: true,
        inviteLinks: {
          where: { isRevoked: false },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: { id: true, name: true, url: true },
        },
      },
    });
    if (channels.length !== channelIds.length) {
      throw new NotFoundException(
        'One or more Telegram channels are unavailable',
      );
    }
    const products = await this.prisma.telegramAdProduct.findMany({
      where: {
        workspaceId,
        telegramChannelId: { in: channelIds },
        isActive: true,
      },
      orderBy: [
        { telegramChannelId: 'asc' },
        { position: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        telegramChannelId: true,
        name: true,
        defaultFixedPrice: true,
        minimumPrice: true,
        currency: true,
      },
    });
    const productsByChannel = new Map<string, typeof products>();
    for (const product of products) {
      const items = productsByChannel.get(product.telegramChannelId) || [];
      items.push(product);
      productsByChannel.set(product.telegramChannelId, items);
    }
    const byId = new Map(channels.map((channel) => [channel.id, channel]));
    return {
      channels: channelIds.map((id) => {
        const channel = byId.get(id)!;
        return {
          id: channel.id,
          title: channel.title,
          username: channel.username || null,
          photoUrl: channel.photoUrl || null,
          tgStatUrl: channel.tgStatUrl || null,
          emojiSource: channel.presentationIcon?.emoji || '📣',
          iconPresentation: iconToResolvedEmoji(channel.presentationIcon),
          defaultInviteLinkId: channel.defaultInviteLinkId || null,
          inviteLinks: channel.inviteLinks.map((link) => ({
            ...link,
            isDefault: link.id === channel.defaultInviteLinkId,
          })),
          products: (productsByChannel.get(channel.id) || []).map(
            (product) => ({
              id: product.id,
              name: product.name,
              price:
                (
                  product.defaultFixedPrice || product.minimumPrice
                )?.toString() || null,
              currency: product.currency,
            }),
          ),
        };
      }),
    };
  }
}
