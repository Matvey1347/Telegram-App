import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { acquirePostgresTransactionLock } from '../../../prisma/postgres-advisory-lock';
import { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';
import { writeTelegramAiPostingSettingsVersion } from './telegram-ai-posting-settings-version.store';

export type AiPostingCompanyCandidate = { entityId: string; name: string; description: string; website: string };
export type AiPostingCompanySetup = { query: string; rubric: string; description?: string; entityId?: string };
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const nameOf = (value: unknown, max: number) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const normalizedWebsite = (value: unknown) => {
  try {
    if (typeof value !== 'string') return '';
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : '';
  } catch { return ''; }
};

@Injectable()
export class TelegramAiPostingChatSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly sources: TelegramAiPostingSourceService,
  ) {}

  private async scope(userId: string, channelId: string, refresh = false) {
    if (refresh) await this.authorization.refresh(userId);
    const access = await this.authorization.require(userId, 'operations.executeAi');
    const member = { workspaceId: access.workspaceId, id: access.memberId };
    const channel = await this.prisma.telegramChannel.findFirst({ where: { id: channelId, workspaceId: member.workspaceId }, select: { id: true } });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return member;
  }

  private async wikidata(parameters: Record<string, string>): Promise<Record<string, any>> {
    const url = new URL('https://www.wikidata.org/w/api.php');
    for (const [key, value] of Object.entries({ ...parameters, format: 'json' })) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'TelegramSystem/1.0 (AI Posting source discovery)', Accept: 'application/json' } });
      if (!response.ok || !response.body || Number(response.headers.get('content-length') ?? 0) > 256 * 1024) throw new Error('bad response');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.length;
          if (length > 256 * 1024) throw new Error('response too large');
          chunks.push(chunk.value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      return record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch { throw new BadGatewayException('AI_POSTING_COMPANY_SEARCH_UNAVAILABLE'); }
  }

  async discover(userId: string, channelId: string, query: string): Promise<{ candidates: AiPostingCompanyCandidate[] }> {
    await this.scope(userId, channelId);
    const name = nameOf(query, 101);
    if (name.length < 2 || name.length > 100 || /(?:https?:|@|[\r\n])/i.test(query) || /[?;{}<>]/.test(name) || /(?:\d[\s()+.-]*){7,}/.test(name) || name.split(' ').length > 8) throw new BadRequestException('AI_POSTING_COMPANY_QUERY_INVALID');
    const found = await this.wikidata({ action: 'wbsearchentities', search: name, language: 'uk', uselang: 'uk', limit: '5', type: 'item' });
    const hits = Array.isArray(found.search) ? found.search.map(record).filter((item: Record<string, any>) => /^Q[1-9]\d{0,10}$/.test(String(item.id))).slice(0, 5) : [];
    if (!hits.length) return { candidates: [] };
    const details = await this.wikidata({ action: 'wbgetentities', ids: hits.map((item: Record<string, any>) => item.id).join('|'), props: 'claims' });
    const entities = record(details.entities);
    const candidates = await Promise.all(hits.map(async (hit: Record<string, any>): Promise<AiPostingCompanyCandidate | null> => {
      const claims = record(record(entities[hit.id]).claims);
      for (const item of Array.isArray(claims.P856) ? claims.P856.slice(0, 3) : []) {
        try {
          const raw = record(record(record(item).mainsnak).datavalue).value;
          const website = new URL(String(raw));
          if (website.protocol !== 'https:' || website.username || website.password) continue;
          website.search = ''; website.hash = '';
          const checked = await this.sources.checkWebSource('website', website.toString());
          if (!checked.ok) continue;
          return { entityId: String(hit.id), name: nameOf(hit.label, 120), description: nameOf(hit.description, 300), website: website.toString() };
        } catch { continue; }
      }
      return null;
    }));
    return { candidates: candidates.filter((item): item is AiPostingCompanyCandidate => Boolean(item)) };
  }

  async setup(userId: string, channelId: string, input: AiPostingCompanySetup) {
    const rubric = nameOf(input.rubric, 121);
    const description = nameOf(input.description, 501);
    if (!rubric || rubric.length > 120 || description.length > 500 || (input.entityId && !/^Q[1-9]\d{0,10}$/.test(input.entityId))) throw new BadRequestException('AI_POSTING_RUBRIC_INVALID');
    const member = await this.scope(userId, channelId);
    const { candidates } = await this.discover(userId, channelId, input.query);
    const matching = input.entityId ? candidates.filter((candidate) => candidate.entityId === input.entityId) : candidates;
    if (!matching.length) throw new BadRequestException('AI_POSTING_COMPANY_SOURCE_NOT_FOUND');
    if (matching.length !== 1) throw new ConflictException({ message: 'AI_POSTING_COMPANY_AMBIGUOUS', candidates: matching });
    const selected = matching[0];
    let newsPage: string | null = null;
    try {
      const pages = await this.sources.discoverNewsPages(selected.website);
      const origin = new URL(selected.website).origin;
      newsPage = pages.map(normalizedWebsite).find((page) => {
        if (!page || page === selected.website) return false;
        const url = new URL(page);
        return url.origin === origin && !url.search && !url.hash;
      }) ?? null;
    } catch {
      // The company and rubric can still be configured; report that no news page was found.
    }
    const refreshedMember = await this.scope(userId, channelId, true);
    if (refreshedMember.workspaceId !== member.workspaceId || refreshedMember.id !== member.id) throw new ConflictException('AI_POSTING_WORKSPACE_CHANGED');
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `ai-posting-structure:${member.workspaceId}:${channelId}`);
      const settings = await tx.telegramAiPostingSettings.findFirst({ where: { workspaceId: member.workspaceId, telegramChannelId: channelId }, select: { id: true, configuration: true, configurationVersion: true } });
      if (!settings) throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
      const configuration = record(settings.configuration);
      const rubrics = Array.isArray(configuration.rubrics) ? configuration.rubrics.map(record) : [];
      const existingRubric = await tx.telegramAiPostingRubric.findFirst({
        where: { workspaceId: member.workspaceId, telegramChannelId: channelId, name: { equals: rubric, mode: 'insensitive' } },
        select: { id: true, name: true },
      });
      const configuredSources = Array.isArray(configuration.sources) ? configuration.sources : [];
      const rubricId = existingRubric?.id ?? randomUUID();
      const canonicalRubric = existingRubric?.name ?? rubric;
      const existingSource = configuredSources.map(record).find((source: Record<string, any>) => source.type === 'website' && normalizedWebsite(source.value) === selected.website && typeof source.id === 'string');
      const source = existingSource ? { ...existingSource, enabled: true } : { id: randomUUID(), type: 'website', value: selected.website, enabled: true, useImages: false };
      const existingNews = newsPage ? configuredSources.map(record).find((item: Record<string, any>) => item.type === 'website' && normalizedWebsite(item.value) === newsPage && typeof item.id === 'string') : undefined;
      const news = newsPage
        ? existingNews
          ? { ...existingNews, enabled: true, followNewsArticles: true }
          : { id: randomUUID(), type: 'website', value: newsPage, enabled: true, useImages: false, followNewsArticles: true }
        : null;
      const preferred = news ? [news, source] : !existingSource || existingSource.enabled === false ? [source] : [];
      const preferredIds = new Set(preferred.map((item) => item.id));
      const nextSources = preferred.length ? [...preferred, ...configuredSources.filter((item: unknown) => !preferredIds.has(record(item).id))] : configuredSources;
      const nextRubric = { id: rubricId, name: canonicalRubric, description, goal: '', emoji: '📝', sphereId: null, lengthIds: [] };
      const nextConfiguration = { ...configuration, sources: nextSources, rubrics: existingRubric ? rubrics : [...rubrics, nextRubric] };
      const changed = !existingSource || existingSource.enabled === false || !existingRubric || Boolean(news && (!existingNews || existingNews.enabled === false || existingNews.followNewsArticles !== true || configuredSources[0]?.id !== news.id || configuredSources[1]?.id !== source.id));
      let settingsVersion = settings.configurationVersion;
      if (changed) {
        const updated = await tx.telegramAiPostingSettings.updateMany({ where: { id: settings.id, workspaceId: member.workspaceId, configurationVersion: settings.configurationVersion }, data: { configuration: nextConfiguration as Prisma.InputJsonObject, configurationVersion: { increment: 1 } } });
        if (updated.count !== 1) throw new ConflictException('AI_POSTING_SETTINGS_CHANGED');
        settingsVersion++;
        await writeTelegramAiPostingSettingsVersion(tx, { settingsId: settings.id, version: settingsVersion, configuration: nextConfiguration as Prisma.InputJsonValue, changeSource: 'system', changedByMemberId: member.id });
      }
      if (!existingRubric) {
        const lengths = await tx.telegramAiPostingLength.findMany({
          where: { workspaceId: member.workspaceId, telegramChannelId: channelId },
          select: { id: true },
        });
        await tx.telegramAiPostingRubric.create({
          data: {
            id: rubricId, name: rubric, description,
            workspaceId: member.workspaceId, telegramChannelId: channelId,
            lengths: { create: lengths.map(({ id: lengthId }) => ({ lengthId })) },
          },
        });
      }
      return { source: { id: source.id as string, type: 'website' as const, value: existingSource ? normalizedWebsite(existingSource.value) : selected.website, added: !existingSource, reEnabled: existingSource?.enabled === false }, newsSource: news ? { id: news.id as string, type: 'website' as const, value: newsPage!, added: !existingNews, reEnabled: existingNews?.enabled === false } : null, rubric: { id: rubricId, name: canonicalRubric, added: !existingRubric }, settingsVersion };
    });
  }
}
