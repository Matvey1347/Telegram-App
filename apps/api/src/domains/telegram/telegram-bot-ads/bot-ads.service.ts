import { createBotAdPlacements } from './bot-ad-placement-create';
import { buildPlacementCreative } from './bot-ad-placement-creative';
export { buildPlacementCreative } from './bot-ad-placement-creative';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkspaceRole } from '@prisma/client';
import type {
  BotAdLinkView,
  BotAdPromoView,
  BotAdsEnvironment,
  BotAdsLinksPage,
  BotAdsPage,
} from '@telegram-system/shared';
import { normalizeTelegramPostMediaItems } from '@telegram-system/shared';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { TelegramChannelNetworkOptionsService } from '../telegram-channel-networks/telegram-channel-network-options.service';
import { publicApiOrigin } from '../../../config/deployment-config';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { normalizeTelegramPostButtonRows } from '@api/telegram/shared/markup/telegram-inline-keyboard';
import { TelegramManagedPostCommandService } from '../telegram-channels/telegram-managed-post-command.service';
import { TelegramManagedPostMediaStorageService } from '../telegram-channels/telegram-managed-post-media-storage.service';
import { TelegramManagedPostPublicationService } from '../telegram-channels/telegram-managed-post-publication.service';
import type {
  BotAdsLinkQueryDto,
  BotAdsPromoQueryDto,
  CreateBotAdLinkDto,
  CreateBotAdPlacementsDto,
  SaveBotAdPromoDto,
} from './bot-ads.dto';
import {
  BOT_ADS_PAGE_SIZE,
  botAdLinkSelect,
  botAdRedirectOrigin,
  botAdLinkView,
  botAdPromoSelect,
  botAdPromoView,
  countBotAdConversions,
  readBotAdCampaignTotals,
  readBotAdCreative,
  telegramBotAdUrl,
} from './bot-ads-read';

type Scope = {
  userId: string;
  botIntegrationId: string;
  environment: BotAdsEnvironment;
};
@Injectable()
export class BotAdsService {
  private readonly apiOrigin = botAdRedirectOrigin(publicApiOrigin());

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly posts: TelegramManagedPostCommandService,
    private readonly publication: TelegramManagedPostPublicationService,
    private readonly media: TelegramManagedPostMediaStorageService,
    private readonly networks: TelegramChannelNetworkOptionsService,
  ) {}

  private async runtime(scope: Scope) {
    const { workspaceId } = await this.workspace.requireWorkspaceRole(
      scope.userId,
      [WorkspaceRole.owner, WorkspaceRole.admin],
    );
    const row = await this.prisma.telegramBotRuntimeInstance.findFirst({
      where: {
        workspaceId,
        botIntegrationId: scope.botIntegrationId,
        environment: scope.environment,
      },
      select: { id: true, username: true },
    });
    if (!row)
      throw new NotFoundException(
        'Bot runtime is not configured for this environment',
      );
    return {
      ...scope,
      workspaceId,
      runtimeInstanceId: row.id,
      username: row.username ?? '',
    };
  }

  async promos(
    scope: Scope,
    query: BotAdsPromoQueryDto,
  ): Promise<BotAdsPage<BotAdPromoView>> {
    const { runtimeInstanceId } = await this.runtime(scope);
    const rows = await this.prisma.botAdPromo.findMany({
      where: {
        runtimeInstanceId,
        archivedAt: query.state === 'archive' ? { not: null } : null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: query.offset,
      take: BOT_ADS_PAGE_SIZE + 1,
      select: botAdPromoSelect,
    });
    return {
      items: rows.slice(0, BOT_ADS_PAGE_SIZE).map(botAdPromoView),
      hasMore: rows.length > BOT_ADS_PAGE_SIZE,
    };
  }

  async savePromo(scope: Scope, dto: SaveBotAdPromoDto, id?: string) {
    const { runtimeInstanceId, workspaceId } = await this.runtime(scope);
    const title = dto.title.trim();
    const mediaItems = normalizeTelegramPostMediaItems(
      dto.mediaItems,
      dto.imageUrls,
    );
    if (
      !title ||
      (!dto.text.trim() && !dto.formattedHtml?.trim() && !mediaItems.length)
    ) {
      throw new BadRequestException('Supply a title and promo text or media');
    }
    if (
      id &&
      !(await this.prisma.botAdPromo.findUnique({
        where: { id, runtimeInstanceId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Promo not found');
    }
    const iconId = dto.iconId ?? null;
    if (
      iconId &&
      !(await this.prisma.icon.findFirst({
        where: { id: iconId, OR: [{ workspaceId }, { workspaceId: null }] },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Promo icon is unavailable');
    const media = this.media.persistMediaUrls(mediaItems, dto.imageUrls);
    const post = {
      text: dto.text,
      plainText: dto.plainText ?? null,
      formattedHtml: dto.formattedHtml ?? null,
      ...media,
      buttonRows: normalizeTelegramPostButtonRows(dto.buttonRows),
    };
    const data = { title, iconId, post };
    const row = id
      ? await this.prisma.botAdPromo.update({
          where: { id, runtimeInstanceId },
          data,
          select: botAdPromoSelect,
        })
      : await this.prisma.botAdPromo.create({
          data: { runtimeInstanceId, ...data },
          select: botAdPromoSelect,
        });
    return botAdPromoView(row);
  }

  async archivePromo(scope: Scope, id: string, archived: boolean) {
    const { runtimeInstanceId } = await this.runtime(scope);
    const existing = await this.prisma.botAdPromo.findUnique({
      where: { id, runtimeInstanceId },
      select: botAdPromoSelect,
    });
    if (!existing) throw new NotFoundException('Promo not found');
    if (Boolean(existing.archivedAt) === archived)
      return botAdPromoView(existing);
    return botAdPromoView(
      await this.prisma.botAdPromo.update({
        where: { id, runtimeInstanceId },
        data: { archivedAt: archived ? new Date() : null },
        select: botAdPromoSelect,
      }),
    );
  }

  async placementPromos(scope: Scope) {
    const { runtimeInstanceId } = await this.runtime(scope);
    return this.prisma.botAdPromo.findMany({
      where: { runtimeInstanceId, archivedAt: null },
      select: { id: true, title: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
  }

  async links(
    scope: Scope,
    query: BotAdsLinkQueryDto,
  ): Promise<BotAdsLinksPage> {
    const runtime = await this.runtime(scope);
    const rows = await this.prisma.botAdLink.findMany({
      where: {
        runtimeInstanceId: runtime.runtimeInstanceId,
        promoId:
          query.promoId ??
          (query.kind === 'link'
            ? null
            : query.kind === 'placement'
              ? { not: null }
              : undefined),
        campaignId: query.campaignId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: query.offset,
      take: BOT_ADS_PAGE_SIZE + 1,
      select: botAdLinkSelect,
    });
    const items = rows.slice(0, BOT_ADS_PAGE_SIZE);
    const [counts, totals] = await Promise.all([
      countBotAdConversions(
        this.prisma,
        runtime,
        items.map((row) => row.id),
      ),
      query.promoId || query.campaignId
        ? readBotAdCampaignTotals(this.prisma, runtime, query)
        : undefined,
    ]);
    return {
      items: items.map((row) =>
        botAdLinkView(
          row,
          runtime.username,
          this.apiOrigin,
          counts.get(row.id),
        ),
      ),
      hasMore: rows.length > BOT_ADS_PAGE_SIZE,
      totals,
    };
  }

  private channelScope(workspaceId: string): Prisma.TelegramChannelWhereInput {
    return {
      workspaceId,
      isActive: true,
      archivedAt: null,
      adminLinks: { some: {} },
      OR: [{ sourceType: 'telegram' }, { sourceType: null }],
    };
  }

  async channels(scope: Scope) {
    const { workspaceId } = await this.runtime(scope);
    const rows = await this.prisma.telegramChannel.findMany({
      where: this.channelScope(workspaceId),
      select: { id: true, title: true, presentationIcon: true, isTest: true },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
    });
    return rows.map(({ presentationIcon, ...channel }) => ({
      ...channel,
      avatarPresentation: iconToResolvedEmoji(presentationIcon),
    }));
  }

  private async channel(workspaceId: string, id: string) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id, ...this.channelScope(workspaceId) },
      select: { id: true },
    });
    if (!channel)
      throw new NotFoundException('Workspace channel is unavailable');
    return channel;
  }

  async createLink(
    scope: Scope,
    dto: CreateBotAdLinkDto,
  ): Promise<BotAdLinkView> {
    const { runtimeInstanceId, username, workspaceId } =
      await this.runtime(scope);
    if (!username)
      throw new BadRequestException(
        'Configure the bot username before creating a link',
      );
    const title = dto.title.trim();
    if (!title || (dto.promoId && !dto.channelId)) {
      throw new BadRequestException(
        'Supply a title and select a channel for the placement',
      );
    }

    const read = () =>
      this.prisma.botAdLink.findUnique({
        where: { id_runtimeInstanceId: { id: dto.id, runtimeInstanceId } },
        select: botAdLinkSelect,
      });
    const existing = await read();
    if (existing) return botAdLinkView(existing, username, this.apiOrigin);
    if (dto.channelId) await this.channel(workspaceId, dto.channelId);
    const data = {
      id: dto.id,
      title,
      runtimeInstanceId,
      promoId: dto.promoId,
      telegramChannelId: dto.channelId,
      tracked: Boolean(this.apiOrigin),
    };
    try {
      if (dto.promoId && dto.channelId) {
        const promo = await this.prisma.botAdPromo.findUnique({
          where: { id: dto.promoId, runtimeInstanceId, archivedAt: null },
          select: { post: true },
        });
        if (!promo) throw new NotFoundException('Active promo not found');
        const url = this.apiOrigin
          ? `${this.apiOrigin}/api/bot-ad-links/${dto.id}`
          : telegramBotAdUrl(username, dto.id);
        const creative = buildPlacementCreative(
          readBotAdCreative(promo.post),
          url,
        );
        await this.posts.createManagedPost(
          scope.userId,
          dto.channelId,
          { title, ...creative },
          {
            onCreated: async (tx, managedPostId) => {
              await tx.botAdLink.create({ data: { ...data, managedPostId } });
            },
          },
        );
      } else {
        const row = await this.prisma.botAdLink.create({
          data,
          select: botAdLinkSelect,
        });
        return botAdLinkView(row, username, this.apiOrigin);
      }
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
    }
    const saved = await read();
    if (!saved) throw new ConflictException('Link ID is already in use');
    return botAdLinkView(saved, username, this.apiOrigin);
  }

  async createPlacements(scope: Scope, dto: CreateBotAdPlacementsDto) {
    const runtime = await this.runtime(scope);
    return createBotAdPlacements({
      prisma: this.prisma,
      posts: this.posts,
      networks: this.networks,
      workspaceChannels: this.channelScope(runtime.workspaceId),
      apiOrigin: this.apiOrigin,
      runtime,
      dto,
    });
  }

  async publish(scope: Scope, id: string, scheduledAt?: string) {
    const runtime = await this.runtime(scope);
    const where = {
      id_runtimeInstanceId: {
        id,
        runtimeInstanceId: runtime.runtimeInstanceId,
      },
    };
    const link = await this.prisma.botAdLink.findUnique({
      where,
      select: botAdLinkSelect,
    });
    if (
      !link?.channel ||
      link.managedPost?.telegramChannelId !== link.channel.id
    ) {
      throw new NotFoundException('Placement not found');
    }
    const post = link.managedPost;
    const date = scheduledAt ? new Date(scheduledAt) : undefined;
    if (
      scheduledAt &&
      (!/(?:Z|[+-]\d{2}:\d{2})$/.test(scheduledAt) ||
        !Number.isFinite(date?.getTime()))
    ) {
      throw new BadRequestException('Supply an explicit publication time zone');
    }
    const intent = date?.toISOString() ?? 'now';
    if (link.publicationIntent && link.publicationIntent !== intent) {
      throw new ConflictException(
        'A different publication time has already been requested for this placement',
      );
    }
    if (post.status === 'SCHEDULED' || post.status === 'PUBLISHED') {
      if (link.publicationIntent !== intent)
        throw new ConflictException(
          'Placement is already scheduled or published',
        );
      const counts = await countBotAdConversions(this.prisma, runtime, [id]);
      return botAdLinkView(
        link,
        runtime.username,
        this.apiOrigin,
        counts.get(id),
      );
    }
    if (post.status !== 'DRAFT' && post.status !== 'FAILED') {
      throw new ConflictException('This placement is being published');
    }
    await this.channel(runtime.workspaceId, link.channel.id);
    if (date && date.getTime() <= Date.now()) {
      throw new BadRequestException('Choose a future publication time');
    }
    if (!link.publicationIntent) {
      const { count } = await this.prisma.botAdLink.updateMany({
        where: {
          id,
          runtimeInstanceId: runtime.runtimeInstanceId,
          publicationIntent: null,
        },
        data: { publicationIntent: intent },
      });
      if (!count)
        throw new ConflictException(
          'A publication request was accepted. Refresh the placement.',
        );
    }
    if (date) {
      await this.publication.scheduleManagedPost(
        scope.userId,
        link.channel.id,
        post.id,
        { scheduledAt: date.toISOString() },
      );
    } else {
      await this.publication.publishManagedPostNow(
        scope.userId,
        link.channel.id,
        post.id,
        {},
      );
    }
    const updated = await this.prisma.botAdLink.findUniqueOrThrow({
      where,
      select: botAdLinkSelect,
    });
    const counts = await countBotAdConversions(this.prisma, runtime, [id]);
    return botAdLinkView(
      updated,
      runtime.username,
      this.apiOrigin,
      counts.get(id),
    );
  }

  async redirect(id: string, count: boolean) {
    const rows = count
      ? await this.prisma.$queryRaw<Array<{ username: string }>>`
      UPDATE "BotAdLink" l SET "clicks" = l."clicks" + 1
      FROM "TelegramBotRuntimeInstance" r
      WHERE l."id" = ${id}::uuid AND l."tracked" AND r."id" = l."runtimeInstanceId"
        AND r."username" IS NOT NULL
      RETURNING r."username"
    `
      : [];
    const row =
      rows[0] ??
      (
        await this.prisma.botAdLink.findUnique({
          where: { id },
          select: { runtime: { select: { username: true } } },
        })
      )?.runtime;
    if (!row?.username || !/^[a-z\d_]+$/i.test(row.username))
      throw new NotFoundException('Bot link not found');
    return telegramBotAdUrl(row.username, id);
  }
}
