import { withTelegramReadDeadline } from './telegram-publication-deadline';
import { Api, TelegramClient } from 'telegram';
import { getTelegramFloodWaitSeconds } from '@api/telegram/shared/mtproto/telegram-session-errors';
import type { BroadcastStatsGraphField } from '@api/telegram/shared/core/telegram-broadcast-stats.types';
import { type StoredTelegramChannelReference } from './telegram-mtproto-client-types';
import type { TelegramMtprotoClient } from './telegram-mtproto.client';

type Dependencies = {
  closeClient: TelegramMtprotoClient['closeClient'];
  createClient: TelegramMtprotoClient['createClient'];
  getErrorProperty: TelegramMtprotoClient['getErrorProperty'];
  getTelegramErrorCode: TelegramMtprotoClient['getTelegramErrorCode'];
  resolveStoredChannel: TelegramMtprotoClient['resolveStoredChannel'];
  telegramMetadataTimeoutMs: TelegramMtprotoClient['telegramMetadataTimeoutMs'];
  telegramResolveTimeoutMs: TelegramMtprotoClient['telegramResolveTimeoutMs'];
  toFiniteNumber: TelegramMtprotoClient['toFiniteNumber'];
  toJsonSafe: TelegramMtprotoClient['toJsonSafe'];
  toTelegramDate: TelegramMtprotoClient['toTelegramDate'];
  withTimeout: TelegramMtprotoClient['withTimeout'];
};

export class TelegramMtprotoBroadcastStatistics {
  constructor(private readonly context: Dependencies) {}

  private readonly broadcastStatsGraphFields: Array<{
    normalized: BroadcastStatsGraphField;
    raw: string[];
  }> = [
    { normalized: 'followers_graph', raw: ['followersGraph'] },
    { normalized: 'growth_graph', raw: ['growthGraph'] },
    { normalized: 'views_graph', raw: ['viewsGraph', 'interactionsGraph'] },
    { normalized: 'shares_graph', raw: ['sharesGraph', 'interactionsGraph'] },
    { normalized: 'languages_graph', raw: ['languagesGraph'] },
    { normalized: 'mute_graph', raw: ['muteGraph'] },
    { normalized: 'views_by_source_graph', raw: ['viewsBySourceGraph'] },
    {
      normalized: 'new_followers_by_source_graph',
      raw: ['newFollowersBySourceGraph'],
    },
    {
      normalized: 'reactions_by_emotion_graph',
      raw: ['reactionsByEmotionGraph'],
    },
  ];

  private parseGraphJson(value: unknown) {
    if (typeof value !== 'string') return value ?? null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  private graphTimestampToDate(value: unknown) {
    const timestamp = this.context.toFiniteNumber(value);
    if (timestamp == null) return null;
    return this.context.toTelegramDate(
      timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp,
    );
  }

  private extractGraphStatsPeriod(
    graphs: Partial<Record<BroadcastStatsGraphField, unknown>>,
  ) {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const graph of Object.values(graphs)) {
      if ((graph as any)?.status !== 'available') continue;
      const columns = (graph as any)?.data?.columns;
      if (!Array.isArray(columns)) continue;
      const dates = columns.find(
        (column: unknown) => Array.isArray(column) && column[0] === 'x',
      );
      if (!Array.isArray(dates)) continue;
      for (const value of dates.slice(1)) {
        const date = this.graphTimestampToDate(value);
        if (!date) continue;
        if (!minDate || date < minDate) minDate = date;
        if (!maxDate || date > maxDate) maxDate = date;
      }
    }

    if (!minDate || !maxDate) return null;
    return {
      minDate: minDate.toISOString(),
      maxDate: maxDate.toISOString(),
      source: 'graphs',
    };
  }

  private async normalizeStatsGraph(
    client: TelegramClient,
    field: BroadcastStatsGraphField,
    graph: unknown,
    warnings: string[],
    statsDcId?: number | null,
  ) {
    let resolvedGraph = graph;
    if (resolvedGraph instanceof Api.StatsGraphAsync) {
      const token = resolvedGraph.token;
      try {
        const response = await this.invokeWithStatsDcMigration(
          client,
          () => new Api.stats.LoadAsyncGraph({ token }),
          statsDcId,
        );
        resolvedGraph = response.result;
        if (response.migrated) {
          warnings.push(
            `${field}: async graph request was retried on Telegram stats DC ${response.dcId}`,
          );
        }
      } catch (error) {
        warnings.push(
          `${field}: async graph could not be loaded (${this.context.getTelegramErrorCode(error)})`,
        );
        return { status: 'pending', token };
      }
    }

    if (resolvedGraph instanceof Api.StatsGraphAsync) {
      warnings.push(`${field}: async graph is still pending`);
      return { status: 'pending', token: resolvedGraph.token };
    }
    if (resolvedGraph instanceof Api.StatsGraphError) {
      warnings.push(`${field}: ${resolvedGraph.error}`);
      return { status: 'error', error: resolvedGraph.error };
    }
    if (resolvedGraph instanceof Api.StatsGraph) {
      return {
        status: 'available',
        data: this.parseGraphJson(resolvedGraph.json?.data),
        zoomToken: resolvedGraph.zoomToken || null,
      };
    }
    if (resolvedGraph == null) {
      warnings.push(`${field}: graph was not returned`);
      return { status: 'unavailable' };
    }

    warnings.push(`${field}: unknown graph response`);
    return {
      status: 'unavailable',
      raw: this.context.toJsonSafe(resolvedGraph),
    };
  }

  private getMigrationDc(error: unknown) {
    const newDc = this.context.toFiniteNumber(
      this.context.getErrorProperty(error, 'newDc'),
    );
    if (newDc != null) return newDc;

    const errorCode = this.context.getTelegramErrorCode(error);
    const match = errorCode.match(/(?:^|_)MIGRATE_(\d+)(?:\b|$)/);
    return match ? this.context.toFiniteNumber(match[1]) : null;
  }

  private async invokeWithStatsDcMigration<R extends Api.AnyRequest>(
    client: TelegramClient,
    requestFactory: () => R,
    statsDcId?: number | null,
  ): Promise<{
    result: R['__response'];
    dcId: number | null;
    migrated: boolean;
  }> {
    const initialDcId = statsDcId ?? null;
    try {
      return {
        result: await this.context.withTimeout(
          client.invoke(requestFactory(), initialDcId ?? undefined),
          this.context.telegramMetadataTimeoutMs,
          'Telegram broadcast statistics request',
        ),
        dcId: initialDcId,
        migrated: false,
      };
    } catch (error) {
      const migrationDc = this.getMigrationDc(error);
      if (migrationDc == null || migrationDc === initialDcId) throw error;
      return {
        result: await this.context.withTimeout(
          client.invoke(requestFactory(), migrationDc),
          this.context.telegramMetadataTimeoutMs,
          'Telegram migrated broadcast statistics request',
        ),
        dcId: migrationDc,
        migrated: true,
      };
    }
  }

  private async getBroadcastStatsDc(
    client: TelegramClient,
    entity: unknown,
  ): Promise<number | null> {
    try {
      const full = await this.context.withTimeout(
        client.invoke(
          new Api.channels.GetFullChannel({ channel: entity as any }),
        ),
        this.context.telegramMetadataTimeoutMs,
        'Telegram broadcast statistics DC lookup',
      );
      return this.context.toFiniteNumber((full as any)?.fullChat?.statsDc);
    } catch {
      return null;
    }
  }

  private normalizeBroadcastStatsError(error: unknown) {
    const errorCode = this.context.getTelegramErrorCode(error);
    const migrationDc = this.getMigrationDc(error);
    const floodWaitSeconds = getTelegramFloodWaitSeconds(error);
    if (floodWaitSeconds != null || errorCode.includes('FLOOD_WAIT')) {
      return {
        status: 'flood_wait',
        errorCode,
        floodWaitSeconds,
        warnings: [
          floodWaitSeconds != null
            ? `Telegram rate limit: retry after ${floodWaitSeconds} seconds`
            : `Telegram rate limit: ${errorCode}`,
        ],
      };
    }
    if (migrationDc != null) {
      return {
        status: 'dc_migrate_required',
        errorCode,
        floodWaitSeconds: null,
        dcId: migrationDc,
        warnings: [
          `Telegram asked to retry broadcast stats on DC ${migrationDc}: ${errorCode}`,
        ],
      };
    }
    if (
      errorCode.includes('CHAT_ADMIN_REQUIRED') ||
      errorCode.includes('CHANNEL_PRIVATE') ||
      errorCode.includes('RIGHT_FORBIDDEN')
    ) {
      return {
        status: 'no_admin_rights',
        errorCode,
        floodWaitSeconds: null,
        warnings: [
          `Broadcast stats require channel admin rights: ${errorCode}`,
        ],
      };
    }
    if (
      errorCode.includes('STATS') ||
      errorCode.includes('CHANNEL_INVALID') ||
      errorCode.includes('BROADCAST_REQUIRED')
    ) {
      return {
        status: 'unavailable',
        errorCode,
        floodWaitSeconds: null,
        warnings: [
          `Broadcast stats are unavailable for this channel: ${errorCode}`,
        ],
      };
    }
    return {
      status: 'unavailable',
      errorCode,
      floodWaitSeconds: null,
      warnings: [`Broadcast stats sync failed: ${errorCode}`],
    };
  }

  async getBroadcastStats(params: {
    apiId: string;
    apiHash: string;
    session: string;
    channelRef?: string;
    channel?: StoredTelegramChannelReference;
  }) {
    try {
      return await withTelegramReadDeadline({
        timeoutMs: 60_000,
        label: 'Telegram broadcast statistics',
        create: (signal) => this.context.createClient(params, signal),
        close: (client) => this.context.closeClient(client),
        run: async (client) => {
          const resolved = params.channel
            ? await this.context.resolveStoredChannel(client, params.channel)
            : null;
          const entity = resolved
            ? resolved.entity
            : await this.context.withTimeout(
                client.getEntity(params.channelRef as string),
                this.context.telegramResolveTimeoutMs,
                'Telegram broadcast channel lookup',
              );
          const warnings: string[] = [];
          const preferredStatsDcId = await this.getBroadcastStatsDc(
            client,
            entity,
          );
          const statsResponse = await this.invokeWithStatsDcMigration(
            client,
            () => new Api.stats.GetBroadcastStats({ channel: entity as any }),
            preferredStatsDcId,
          );
          const rawStats = statsResponse.result;
          const statsDcId = statsResponse.dcId;
          if (statsResponse.migrated) {
            warnings.push(
              `Broadcast stats request was retried on Telegram stats DC ${statsDcId}`,
            );
          }
          const rawStatsRecord = rawStats as unknown as Record<string, unknown>;
          const graphs: Partial<Record<BroadcastStatsGraphField, unknown>> = {};
          const availableFields: string[] = [];

          for (const field of this.broadcastStatsGraphFields) {
            const normalizedGraph = await this.normalizeStatsGraph(
              client,
              field.normalized,
              field.raw
                .map((rawField) => rawStatsRecord[rawField])
                .find((graph) => graph != null),
              warnings,
              statsDcId,
            );
            graphs[field.normalized] = normalizedGraph;
            if (normalizedGraph.status === 'available') {
              availableFields.push(field.normalized);
            }
          }
          const graphPeriod = this.extractGraphStatsPeriod(graphs);

          return {
            raw: this.context.toJsonSafe(rawStats),
            normalized: {
              status: 'available',
              period: graphPeriod || this.context.toJsonSafe(rawStats.period),
              raw_period: this.context.toJsonSafe(rawStats.period),
              followers: this.context.toJsonSafe(rawStats.followers),
              views_per_post: this.context.toJsonSafe(rawStats.viewsPerPost),
              shares_per_post: this.context.toJsonSafe(rawStats.sharesPerPost),
              reactions_per_post: this.context.toJsonSafe(
                rawStats.reactionsPerPost,
              ),
              enabled_notifications: this.context.toJsonSafe(
                rawStats.enabledNotifications,
              ),
              graphs,
            },
            availableFields,
            warnings,
          };
        },
      });
    } catch (error) {
      const normalizedError = this.normalizeBroadcastStatsError(error);
      return {
        raw: { error: this.context.toJsonSafe(normalizedError) },
        normalized: normalizedError,
        availableFields: [],
        warnings: normalizedError.warnings,
      };
    }
  }
}
