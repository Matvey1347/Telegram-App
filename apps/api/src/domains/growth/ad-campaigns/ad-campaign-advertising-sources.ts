import { BadRequestException } from '@nestjs/common';

export function normalizeSelectionIds(ids: Array<string | null | undefined>) {
  return [
    ...new Set(ids.map((value) => String(value || '').trim()).filter(Boolean)),
  ];
}

export function resolveCampaignCustomTitleTemplate(
  rawTitle: string | null | undefined,
) {
  const value = String(rawTitle || '').trim();
  return value || null;
}

export function renderCampaignTitleTemplate(
  template: string,
  placementDate: Date,
) {
  return template.replace(/\[date\]/gi, formatDatePart(placementDate));
}

function formatDatePart(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function shortenBlock(value?: string | null) {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '-';
  if (words.length <= 2) return words.join(' ');
  return `${words[0]} ${words[1]}...`;
}

function formatPromoLabel(promos: Array<{ title?: string | null }>) {
  const cleaned = promos
    .map((promo) => shortenBlock(promo?.title))
    .filter((title) => title && title !== '-');
  if (!cleaned.length) return 'promo';
  if (cleaned.length === 1) return cleaned[0];
  return `${cleaned[0]} +${cleaned.length - 1}`;
}

function sourceTypeLabel(source: any) {
  const raw = String(source?.sourceKind || source?.sourceType || 'telegram')
    .replace(/_/g, ' ')
    .trim();
  return raw || 'telegram';
}

function parseAdvertisingSourceSelection(ids: string[]) {
  const channelIds: string[] = [];
  const sourceIds: string[] = [];
  for (const rawId of ids || []) {
    const raw = String(rawId || '').trim();
    if (!raw) continue;
    if (raw.startsWith('source:') || raw.startsWith('person:')) {
      sourceIds.push(raw.replace(/^(source|person):/, ''));
    } else if (raw.startsWith('channel:')) {
      channelIds.push(raw.replace(/^channel:/, ''));
    } else {
      channelIds.push(raw);
    }
  }
  return {
    channelIds: [...new Set(channelIds)],
    sourceIds: [...new Set(sourceIds)],
  };
}

export function normalizeTelegramChannelSource(channel: any) {
  const isOwn =
    Array.isArray(channel?.adminLinks) && channel.adminLinks.length > 0;
  return {
    ...channel,
    selectionId: `channel:${channel.id}`,
    sourceKind: isOwn ? 'own_channel' : 'external_channel',
    kind: isOwn ? 'own_channel' : 'external_channel',
    imageUrl: channel.photoUrl,
    subscribersCount: channel.currentSubscribersCount ?? 0,
  };
}

export function normalizePersonSource(source: any) {
  return {
    id: source.id,
    selectionId: `source:${source.id}`,
    sourceKind: 'person',
    kind: 'person',
    title: source.name,
    username: source.telegramUsername,
    telegramUrl: source.url,
    contactInfo: source.contactInfo,
    notes: source.notes,
    imageUrl: source.imageUrl,
    subscribersCount: source.subscribersCount ?? 0,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function normalizeUsername(value?: string | null) {
  const normalized = String(value || '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  return normalized || null;
}

export async function resolveLegacyTelegramChannelSource(
  tx: any,
  workspaceId: string,
  source: any,
) {
  const username = normalizeUsername(source?.telegramUsername);
  const channel = await tx.telegramChannel.findFirst({
    where: {
      workspaceId,
      OR: [
        ...(username
          ? [{ username: { equals: username, mode: 'insensitive' } }]
          : []),
        ...(source?.name ? [{ title: source.name }] : []),
      ],
    },
    include: { adminLinks: true },
  });
  return channel ? normalizeTelegramChannelSource(channel) : null;
}

export function dedupeAdvertisingSources(sources: any[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key =
      source.selectionId ||
      `${source.sourceKind || source.kind || 'unknown'}:${source.id || source.title || source.name || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function resolveAdvertisingSourceSelection(
  tx: any,
  workspaceId: string,
  rawIds: string[],
) {
  const parsed = parseAdvertisingSourceSelection(rawIds);
  const [channels, sourceRows] = await Promise.all([
    parsed.channelIds.length
      ? tx.telegramChannel.findMany({
          where: { workspaceId, id: { in: parsed.channelIds } },
          select: { id: true },
        })
      : [],
    parsed.sourceIds.length
      ? tx.advertisingSource.findMany({
          where: { workspaceId, id: { in: parsed.sourceIds } },
          select: {
            id: true,
            type: true,
            name: true,
            telegramUsername: true,
          },
        })
      : [],
  ]);

  if (channels.length !== parsed.channelIds.length) {
    throw new BadRequestException(
      'One or more advertising channels are invalid',
    );
  }

  if (sourceRows.length !== parsed.sourceIds.length) {
    throw new BadRequestException('One or more advertising people are invalid');
  }

  const people = sourceRows.filter(
    (source: any) => source.type !== 'telegram_channel',
  );
  const legacyChannelSources = sourceRows.filter(
    (source: any) => source.type === 'telegram_channel',
  );

  const resolvedLegacyChannels = await Promise.all(
    legacyChannelSources.map((source: any) =>
      resolveLegacyTelegramChannelSource(tx, workspaceId, source),
    ),
  );

  const unresolvedLegacyChannelSources = legacyChannelSources.filter(
    (_source: any, index: number) => !resolvedLegacyChannels[index]?.id,
  );

  return {
    channelIds: [
      ...new Set([
        ...parsed.channelIds,
        ...resolvedLegacyChannels
          .filter((channel: any) => channel?.id)
          .map((channel: any) => channel.id),
      ]),
    ],
    sourceIds: [
      ...new Set([
        ...people.map((source: any) => source.id),
        ...unresolvedLegacyChannelSources.map((source: any) => source.id),
      ]),
    ],
  };
}

export async function ensureAdvertisingSources(
  tx: any,
  workspaceId: string,
  ownTelegramChannelId: string,
  advertisingSourceIds: string[],
) {
  const parsed = await resolveAdvertisingSourceSelection(
    tx,
    workspaceId,
    advertisingSourceIds,
  );
  if (parsed.channelIds.includes(ownTelegramChannelId)) {
    throw new BadRequestException(
      'Advertising channel cannot be the same as own Telegram channel',
    );
  }
  return parsed;
}

export async function generateCampaignTitle(
  tx: any,
  workspaceId: string,
  placementDate: Date,
  promoIds: string[],
  advertisingSourceIds: string[],
) {
  const parsed = parseAdvertisingSourceSelection(advertisingSourceIds);
  const [promo, channels, people] = await Promise.all([
    promoIds.length
      ? tx.promo.findMany({
          where: { id: { in: promoIds }, workspaceId },
          select: { id: true, title: true },
        })
      : [],
    tx.telegramChannel.findMany({
      where: { workspaceId, id: { in: parsed.channelIds } },
      select: { title: true, sourceType: true },
    }),
    tx.advertisingSource.findMany({
      where: { workspaceId, id: { in: parsed.sourceIds } },
      select: { name: true, type: true },
    }),
  ]);

  const sources = [
    ...channels.map((channel: any) => ({
      title: channel.title,
      sourceKind: 'telegram_channel',
      sourceType: channel.sourceType,
    })),
    ...people.map((person: any) => ({
      title: person.name,
      sourceKind: 'person',
    })),
  ];
  const firstSource = sources?.[0];
  const sourceLabel = shortenBlock(
    firstSource?.title || firstSource?.name || 'source',
  );
  const promosById = new Map((promo || []).map((item: any) => [item.id, item]));
  const orderedPromos = promoIds
    .map((promoId) => promosById.get(promoId))
    .filter((promo): promo is { title?: string | null } => Boolean(promo));
  const promoLabel = formatPromoLabel(orderedPromos);
  const typeLabel = shortenBlock(sourceTypeLabel(firstSource));
  const dateLabel = formatDatePart(placementDate);
  return `${dateLabel} | ${sourceLabel} | ${promoLabel} | ${typeLabel}`;
}
