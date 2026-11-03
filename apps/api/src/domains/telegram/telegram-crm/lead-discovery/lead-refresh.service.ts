import { Injectable } from '@nestjs/common';
import type { LeadSourceView } from '@telegram-system/shared';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadTransportService } from './lead-transport.service';

@Injectable()
export class TelegramLeadRefreshService {
  constructor(private readonly read: TelegramLeadReadService, private readonly transport: TelegramLeadTransportService) {}

  async run(userId: string, progress: (item: { source: LeadSourceView; status: 'updated' | 'failed' | 'skipped'; scanned: number; truncated: boolean }, current: number, total: number) => void, signal: AbortSignal, sourceId?: string) {
    const sources: LeadSourceView[] = [];
    let cursor: string | undefined;
    const seen = new Set<string>();
    if (sourceId) sources.push(await this.read.source(userId, sourceId));
    else do {
      const page = await this.read.sources(userId, { limit: 50, cursor });
      sources.push(...page.items);
      if (!page.hasMore) break;
      if (!page.nextCursor || seen.has(page.nextCursor)) throw new Error('Invalid source cursor');
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    } while (!signal.aborted);
    let updated = 0, failed = 0, skipped = 0;
    for (const source of sources) {
      if (signal.aborted) break;
      let status: 'updated' | 'failed' | 'skipped' = 'updated';
      let scanned = 0, truncated = false;
      if (!source.accountId || !source.channelId || source.monitoringState === 'DISABLED') { status = 'skipped'; skipped++; }
      else {
        try {
          let beforeId: number | undefined;
          for (let page = 0; page < 10 && !signal.aborted; page++) {
            const result = await this.transport.scan(userId, source.id, { limit: 50, beforeId });
            scanned += result.received;
            if (!result.hasMore) break;
            if (!result.nextBeforeId || result.nextBeforeId === beforeId) throw new Error('Invalid history cursor');
            beforeId = result.nextBeforeId;
            truncated = page === 9;
          }
          updated++;
        } catch { status = 'failed'; failed++; }
      }
      const refreshed = status === 'updated' ? await this.read.source(userId, source.id) : source;
      progress({ source: refreshed, status, scanned, truncated }, updated + failed + skipped, sources.length);
    }
    return { updated, failed, skipped };
  }
}
