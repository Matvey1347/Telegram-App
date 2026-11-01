import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TelegramLeadSource } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../../workspace/workspace-authorization/workspace-authorization.service';

export function parseLeadProcessingGrants(
  raw: unknown,
): Record<string, unknown>[] {
  try {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 512 * 1024)
      return [];
    const values = JSON.parse(raw) as unknown;
    if (!Array.isArray(values) || values.length > 1000) return [];
    return values.filter(
      (value: unknown): value is Record<string, unknown> =>
        value !== null && typeof value === 'object' && !Array.isArray(value),
    );
  } catch {
    return [];
  }
}
function matchingGrant(
  grants: Record<string, unknown>[],
  source: Pick<
    TelegramLeadSource,
    | 'workspaceId'
    | 'normalizedKey'
    | 'accountId'
    | 'processingReference'
    | 'allowOwnChannel'
    | 'channelId'
  >,
  mode: 'ingest' | 'ai',
  allowUnresolvedMetadata = false,
) {
  return grants.some(
    (grant) =>
      grant.workspaceId === source.workspaceId &&
      grant.sourceKey === source.normalizedKey &&
      grant.accountId === source.accountId &&
      (source.normalizedKey.startsWith('manual:')
        ? grant.channelId === null
        : source.channelId !== null
          ? grant.channelId === source.channelId
          : allowUnresolvedMetadata) &&
      grant.reference === source.processingReference &&
      /^(policy|consent):[A-Za-z0-9_.-]{1,80}$/.test(
        source.processingReference,
      ) &&
      grant[mode] === true &&
      (!source.allowOwnChannel || grant.allowOwnChannel === true) &&
      typeof grant.expiresAt === 'string' &&
      /^\d{4}-\d{2}-\d{2}T.*Z$/.test(grant.expiresAt) &&
      new Date(grant.expiresAt).getTime() > Date.now(),
  );
}
export function leadProcessingGranted(
  raw: unknown,
  source: Pick<
    TelegramLeadSource,
    | 'workspaceId'
    | 'normalizedKey'
    | 'accountId'
    | 'processingReference'
    | 'allowOwnChannel'
    | 'channelId'
  >,
  mode: 'ingest' | 'ai',
  allowUnresolvedMetadata = false,
) {
  return matchingGrant(
    parseLeadProcessingGrants(raw),
    source,
    mode,
    allowUnresolvedMetadata,
  );
}
@Injectable()
export class TelegramLeadPolicy {
  private grantRaw: unknown;
  private grantRecords: Record<string, unknown>[] = [];
  constructor(
    readonly prisma: PrismaService,
    private readonly authorization: WorkspaceAuthorizationService,
    private readonly config: ConfigService,
  ) {}
  async refresh(userId: string) {
    await this.authorization.refresh(userId);
  }
  enabled() {
    return (
      this.config.get<string>('INTERNAL_LEAD_DISCOVERY_ENABLED') === 'true'
    );
  }
  async access(
    userId: string,
    capability: 'view' | 'manage' | 'review' | 'analyze' = 'view',
  ) {
    await this.authorization.require(userId, 'adSales.crm.view');
    const access = await this.authorization.require(
      userId,
      `adSales.leads.${capability}`,
    );
    if (capability === 'analyze')
      await this.authorization.require(userId, 'operations.executeAi');
    return access;
  }
  async configuration(userId: string) {
    await this.access(userId);
    return {
      enabled: this.enabled(),
      canManage: await this.authorization.can(userId, 'adSales.leads.manage'),
      canReview: await this.authorization.can(userId, 'adSales.leads.review'),
      canAnalyze:
        (await this.authorization.can(userId, 'adSales.leads.analyze')) &&
        (await this.authorization.can(userId, 'operations.executeAi')),
      maxSources: 1000,
      maxPostsPerDay: 10000,
      maxSourceImport: 100,
      maxMaterialBatch: 20,
    };
  }
  async source(
    userId: string,
    id: string,
    capability: 'view' | 'manage' | 'review' | 'analyze' = 'view',
  ) {
    const { workspaceId } = await this.access(userId, capability);
    const source = await this.prisma.telegramLeadSource.findFirst({
      where: { id, workspaceId },
    });
    if (!source) throw new NotFoundException('LEAD_SOURCE_NOT_FOUND');
    return source;
  }
  granted(
    source: Pick<
      TelegramLeadSource,
      | 'workspaceId'
      | 'normalizedKey'
      | 'accountId'
      | 'processingReference'
      | 'allowOwnChannel'
      | 'channelId'
    >,
    mode: 'ingest' | 'ai',
    allowUnresolvedMetadata = false,
  ) {
    const raw = this.config.get<unknown>('INTERNAL_LEAD_DISCOVERY_GRANTS');
    if (raw !== this.grantRaw) {
      this.grantRaw = raw;
      this.grantRecords = parseLeadProcessingGrants(raw);
    }
    return (
      this.enabled() &&
      matchingGrant(this.grantRecords, source, mode, allowUnresolvedMetadata)
    );
  }
  assertProcessing(
    source: TelegramLeadSource,
    mode: 'ingest' | 'ai',
    requireActive = true,
  ) {
    if (
      ['DISABLED', 'ACCESS_LOST'].includes(source.monitoringState) ||
      (requireActive && source.monitoringState !== 'ACTIVE') ||
      !this.granted(source, mode)
    )
      throw new ForbiddenException('LEAD_PROCESSING_NOT_APPROVED');
  }
  async recheckAi(userId: string, sourceId: string) {
    await this.refresh(userId);
    const source = await this.source(userId, sourceId, 'analyze');
    this.assertProcessing(source, 'ai', false);
    return source;
  }
  async account(userId: string, accountId: string) {
    const access = await this.access(userId, 'manage');
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id: accountId, workspaceId: access.workspaceId },
      select: { id: true, label: true, workspaceId: true },
    });
    if (!account) throw new NotFoundException('LEAD_ACCOUNT_NOT_FOUND');
    return account;
  }
}
