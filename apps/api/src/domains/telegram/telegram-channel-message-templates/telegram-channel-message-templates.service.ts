import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TelegramAdPricingMode } from '@prisma/client';
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
import { loadAdSalesProductsForChannelsWithDefaults } from '../telegram-ad-sales/telegram-ad-sales-default-products';
import { TelegramAdSalesPricingReader } from '../telegram-ad-sales/telegram-ad-sales-pricing-reader';

const uniqueIds = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const stringRecord = (value: unknown, limit = 30) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value)
          .filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === 'string' && Boolean(entry[1].trim()),
          )
          .slice(0, limit)
          .map(([key, item]) => [key.trim(), item.trim()]),
      )
    : {};

const templateInclude = {
  icon: true,
} satisfies Prisma.TelegramChannelMessageTemplateInclude;

type TemplateRow = Prisma.TelegramChannelMessageTemplateGetPayload<{
  include: typeof templateInclude;
}>;

@Injectable()
export class TelegramChannelMessageTemplatesService {
  private readonly pricingReader: TelegramAdSalesPricingReader;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {
    this.pricingReader = new TelegramAdSalesPricingReader(prisma);
  }

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
      groupChannels: row.groupChannels,
      groupMode: row.groupMode,
      channelGroupLabels: stringRecord(row.channelGroupLabels, 100),
      channelGroupHeaderTemplate: row.channelGroupHeaderTemplate,
      introText: row.introText,
      audienceSummaryTemplate: row.audienceSummaryTemplate,
      outroText: row.outroText,
      bodyTemplate: row.bodyTemplate,
      overrideInviteLinks: row.overrideInviteLinks,
      inviteLinkOverrides: overrides,
      excludedProductNames: row.excludedProductNames,
      priceRounding: row.priceRounding,
      productNameOverrides: stringRecord(row.productNameOverrides),
      bundleOfferEnabled: row.bundleOfferEnabled,
      bundleDiscountPercent: row.bundleDiscountPercent,
      bundleBasePriceOverrides: stringRecord(row.bundleBasePriceOverrides),
      bundleOfferTemplate: row.bundleOfferTemplate,
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
    const channelGroupLabels = Object.fromEntries(
      Object.entries(dto.channelGroupLabels || {})
        .filter(
          ([id, label]) =>
            channelIds.includes(id) &&
            typeof label === 'string' &&
            label.trim(),
        )
        .map(([id, label]) => [id, label.trim().slice(0, 80)]),
    );
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
      groupChannels: dto.groupChannels ?? false,
      groupMode: dto.groupMode ?? 'CUSTOM',
      channelGroupLabels,
      channelGroupHeaderTemplate:
        dto.channelGroupHeaderTemplate?.trim().slice(0, 160) || null,
      introText: dto.introText?.trim() ? dto.introText : null,
      audienceSummaryTemplate: dto.audienceSummaryTemplate?.trim()
        ? dto.audienceSummaryTemplate
        : null,
      outroText: dto.outroText?.trim() ? dto.outroText : null,
      bodyTemplate: dto.bodyTemplate,
      overrideInviteLinks: dto.overrideInviteLinks,
      inviteLinkOverrides: Object.fromEntries(links),
      excludedProductNames: uniqueIds(dto.excludedProductNames || []),
      priceRounding: dto.priceRounding || 'NONE',
      productNameOverrides: stringRecord(dto.productNameOverrides),
      bundleOfferEnabled: dto.bundleOfferEnabled ?? false,
      bundleDiscountPercent: dto.bundleDiscountPercent ?? 10,
      bundleBasePriceOverrides: stringRecord(dto.bundleBasePriceOverrides),
      bundleOfferTemplate: dto.bundleOfferTemplate?.trim()
        ? dto.bundleOfferTemplate
        : null,
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
    let channelIds = uniqueIds(dto.channelIds ?? []);
    if (dto.templateId?.trim()) {
      const template =
        await this.prisma.telegramChannelMessageTemplate.findFirst({
          where: { id: dto.templateId.trim(), workspaceId },
          select: { scopeMode: true, networkId: true, channelIds: true },
        });
      if (!template) throw new NotFoundException('Message template not found');
      if (template.scopeMode === 'NETWORK') {
        const scopedChannels = await this.prisma.telegramChannel.findMany({
          where: {
            workspaceId,
            isActive: true,
            ...(template.networkId
              ? { networkMembers: { some: { networkId: template.networkId } } }
              : {}),
          },
          orderBy: [{ title: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        const available = new Set(scopedChannels.map((channel) => channel.id));
        channelIds = [
          ...uniqueIds(template.channelIds).filter((id) => available.has(id)),
          ...scopedChannels
            .map((channel) => channel.id)
            .filter((id) => !template.channelIds.includes(id)),
        ];
      } else {
        channelIds = uniqueIds(template.channelIds);
      }
    }
    if (!channelIds.length) {
      throw new BadRequestException('Select at least one Telegram channel');
    }
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, id: { in: channelIds }, isActive: true },
      select: {
        id: true,
        title: true,
        shortDescription: true,
        username: true,
        photoUrl: true,
        tgStatUrl: true,
        currentSubscribersCount: true,
        ownViewsPerPost: true,
        adBaseCpm: true,
        internalCpm: true,
        adBaseCurrency: true,
        updatedAt: true,
        defaultInviteLinkId: true,
        presentationIcon: true,
        networkMembers: {
          select: {
            network: {
              select: { name: true, icon: { select: { emoji: true } } },
            },
          },
          orderBy: { network: { name: 'asc' } },
        },
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
    const products = (
      await loadAdSalesProductsForChannelsWithDefaults(this.prisma, {
        workspaceId,
        channels,
      })
    ).filter((product) => product.isActive);
    const pricingSources = await this.pricingReader.sourcesForChannels(
      workspaceId,
      channels,
    );
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
        const pricingSource = pricingSources.get(channel.id);
        const channelProducts = (productsByChannel.get(channel.id) || []).map(
          (product) => {
            const preview = pricingSource
              ? this.pricingReader.previewFromSource(pricingSource, product)
              : null;
            const internalPreview =
              pricingSource && channel.internalCpm != null
                ? this.pricingReader.previewFromSource(pricingSource, product, {
                    pricingMode: TelegramAdPricingMode.CPM,
                    targetCpm: channel.internalCpm,
                    minimumCpm: channel.internalCpm,
                  })
                : null;
            return {
              id: product.id,
              name: product.name,
              price: preview?.recommendedPrice ?? null,
              internalPrice: internalPreview?.recommendedPrice ?? null,
              expectedViews: preview?.expectedViews ?? null,
              publicCpm: preview?.targetCpm ?? null,
              internalCpm: internalPreview?.targetCpm ?? null,
              currency:
                preview?.currency || channel.adBaseCurrency || product.currency,
            };
          },
        );
        return {
          id: channel.id,
          title: channel.title,
          description: channel.shortDescription || null,
          username: channel.username || null,
          photoUrl: channel.photoUrl || null,
          tgStatUrl: channel.tgStatUrl || null,
          emojiSource: channel.presentationIcon?.emoji || '📣',
          subscribersCount:
            channel.currentSubscribersCount != null &&
            channel.currentSubscribersCount > 0
              ? channel.currentSubscribersCount
              : null,
          networkGroups: (channel.networkMembers ?? []).map((member) => ({
            name: member.network.name,
            emojiSource: member.network.icon?.emoji || null,
          })),
          viewsPerPost:
            channel.ownViewsPerPost > 0
              ? channel.ownViewsPerPost
              : (channelProducts.find(
                  (product) => product.expectedViews != null,
                )?.expectedViews ?? null),
          iconPresentation: iconToResolvedEmoji(channel.presentationIcon),
          defaultInviteLinkId: channel.defaultInviteLinkId || null,
          inviteLinks: channel.inviteLinks.map((link) => ({
            ...link,
            isDefault: link.id === channel.defaultInviteLinkId,
          })),
          products: channelProducts,
        };
      }),
    };
  }
}
