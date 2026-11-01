import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { leadSource } from './lead.spec-fixtures';
import type { LeadContact } from '@telegram-system/shared';
import {
  leadProcessingGranted,
  parseLeadProcessingGrants,
} from './lead-policy.service';
import {
  normalizeLeadSource,
  normalizeLeadContact,
  strongLeadIdentity,
  literalLeadLinks,
  leadCursor,
  decodeLeadCursor,
} from './lead-normalization';
import { leadImportReferences } from './lead-source.service';
import { leadCsvCell, leadSpreadsheetText } from './lead-export.service';
const source = {
  workspaceId: 'workspace',
  normalizedKey: 'telegram:username:source_channel',
  accountId: 'account',
  channelId: '12345',
  processingReference: 'policy:reviewed_source',
  allowOwnChannel: false,
};
const grant = {
  workspaceId: source.workspaceId,
  sourceKey: source.normalizedKey,
  accountId: source.accountId,
  channelId: source.channelId,
  reference: source.processingReference,
  ingest: true,
  ai: false,
  allowOwnChannel: false,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};
const contact = (
  value: string,
  role: LeadContact['role'] = 'SALES_CONTACT',
): LeadContact => ({ type: 'TELEGRAM', value, role, evidence: value });
describe('Lead processing grants and source/contact identities', () => {
  it('requires exact bounded current workspace/source/account/reference/mode grants', () => {
    const raw = JSON.stringify([grant]);
    expect(leadProcessingGranted(raw, source, 'ingest')).toBe(true);
    expect(leadProcessingGranted(raw, source, 'ai')).toBe(false);
    for (const changed of [
      { workspaceId: 'other' },
      { normalizedKey: 'telegram:username:other' },
      { accountId: null },
      { processingReference: 'policy:other' },
      { allowOwnChannel: true },
    ])
      expect(
        leadProcessingGranted(raw, { ...source, ...changed }, 'ingest'),
      ).toBe(false);
    expect(
      leadProcessingGranted(
        JSON.stringify([{ ...grant, expiresAt: new Date(0).toISOString() }]),
        source,
        'ingest',
      ),
    ).toBe(false);
    expect(leadProcessingGranted('not-json', source, 'ingest')).toBe(false);
    expect(
      parseLeadProcessingGrants(
        JSON.stringify(Array.from({ length: 1001 }, () => grant)),
      ),
    ).toEqual([]);
  });
  it('supports 1000 reviewed exact grants without wildcards or unbounded config', () => {
    expect(
      parseLeadProcessingGrants(
        JSON.stringify(Array.from({ length: 1000 }, () => grant)),
      ),
    ).toHaveLength(1000);
    expect(parseLeadProcessingGrants(' '.repeat(512 * 1024 + 1))).toEqual([]);
  });
  it('requires operations.executeAi before any analyze claim and hides unavailable analyze capability', async () => {
    const auth = {
      require: jest.fn((_user: string, permission: string) =>
        permission === 'operations.executeAi'
          ? Promise.reject(new ForbiddenException('execute denied'))
          : Promise.resolve({ workspaceId: 'workspace' }),
      ),
      can: jest.fn((_user: string, permission: string) =>
        Promise.resolve(permission !== 'operations.executeAi'),
      ),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'INTERNAL_LEAD_DISCOVERY_ENABLED'
          ? 'true'
          : JSON.stringify([grant]),
      ),
    };
    const policy = new TelegramLeadPolicy(
      {} as PrismaService,
      auth as unknown as WorkspaceAuthorizationService,
      config as unknown as ConfigService,
    );
    await expect(policy.access('user', 'analyze')).rejects.toThrow(
      'execute denied',
    );
    expect(await policy.configuration('user')).toMatchObject({
      canAnalyze: false,
    });
    const approved = leadSource(source);
    for (const state of ['DISABLED', 'ACCESS_LOST'])
      expect(() =>
        policy.assertProcessing(
          { ...approved, monitoringState: state },
          'ingest',
          false,
        ),
      ).toThrow('LEAD_PROCESSING_NOT_APPROVED');
    expect(() =>
      policy.assertProcessing(
        { ...approved, monitoringState: 'PAUSED' },
        'ingest',
        false,
      ),
    ).not.toThrow();
    expect(policy.granted({ ...approved, channelId: null }, 'ingest')).toBe(
      false,
    );
    expect(
      policy.granted({ ...approved, channelId: null }, 'ingest', true),
    ).toBe(true);
    expect(
      policy.granted({ ...approved, channelId: 'reassigned' }, 'ingest', true),
    ).toBe(false);
  });
  it('normalizes Telegram references without joining or title matching', () => {
    expect(
      normalizeLeadSource({
        type: 'TELEGRAM_CHANNEL',
        reference: 'https://t.me/Some_Channel',
      }).normalizedKey,
    ).toBe('telegram:username:some_channel');
    expect(
      normalizeLeadSource({ type: 'TELEGRAM_CHANNEL', reference: '-10012345' })
        .normalizedKey,
    ).toBe('telegram:id:12345');
    expect(
      normalizeLeadSource({
        type: 'MANUAL_IMPORT',
        reference: 'Approved Campaign',
      }).normalizedKey,
    ).toBe('manual:approved campaign');
    const privateSource = normalizeLeadSource({
      type: 'TELEGRAM_CHANNEL',
      reference: 'https://t.me/+synthetic_invite-A',
    });
    expect(privateSource).toMatchObject({
      channelId: null,
      username: null,
      url: 'https://t.me/+synthetic_invite-A',
    });
    expect(privateSource.normalizedKey).toMatch(
      /^telegram:invite:[a-f0-9]{64}$/,
    );
    expect(
      normalizeLeadSource({
        type: 'TELEGRAM_CHANNEL',
        reference: 'https://telegram.me/joinchat/synthetic_invite-A',
      }).normalizedKey,
    ).toBe(privateSource.normalizedKey);
    expect(
      normalizeLeadSource({
        type: 'TELEGRAM_CHANNEL',
        reference: 'https://t.me/+synthetic_invite-B',
      }).normalizedKey,
    ).not.toBe(privateSource.normalizedKey);
    for (const reference of [
      'https://evil.example/t.me/+synthetic_invite',
      'https://t.me/+synthetic_invite/extra',
      'https://t.me/+synthetic_invite?redirect=1',
    ]) {
      expect(() =>
        normalizeLeadSource({ type: 'TELEGRAM_CHANNEL', reference }),
      ).toThrow();
    }
  });
  it('requires literal contact evidence, strips model confirmation and normalizes exact identifiers', () => {
    const text = 'Для замовлення пишіть @Sales_Manager';
    const normalized = normalizeLeadContact(
      { ...contact('@Sales_Manager'), confirmed: true },
      text,
    );
    expect(normalized).toMatchObject({
      value: '@sales_manager',
      confirmed: false,
      role: 'SALES_CONTACT',
    });
    expect(strongLeadIdentity([normalized])).toBe('telegram:@sales_manager');
    expect(() =>
      normalizeLeadContact(
        contact('@invented'),
        'Для замовлення пишіть @real_contact',
      ),
    ).toThrow('LEAD_CONTACT_NOT_LITERAL');
  });
  it('never treats channel links, @destinations, agencies, unknown roles or names as owner identities', () => {
    for (const value of ['@some_channel', 'https://t.me/some_channel']) {
      const result = normalizeLeadContact(
        contact(value),
        `Читайте канал ${value}`,
      );
      expect(result.role).toBe('ADVERTISED_DESTINATION');
      expect(strongLeadIdentity([result])).toBeNull();
    }
    for (const role of ['UNKNOWN', 'AGENCY', 'ADVERTISED_DESTINATION'] as const)
      expect(strongLeadIdentity([contact('@some_name', role)])).toBeNull();
  });
  it('rejects partial handles/emails and Instagram post URLs masquerading as business profiles', () => {
    expect(() =>
      normalizeLeadContact(
        contact('@business'),
        'Для замовлення пишіть @business_other',
      ),
    ).toThrow('LEAD_CONTACT_NOT_LITERAL');
    expect(() =>
      normalizeLeadContact(
        contact('https://t.me/business'),
        'Для замовлення пишіть https://t.me/business_other',
      ),
    ).toThrow('LEAD_CONTACT_NOT_LITERAL');
    expect(() =>
      normalizeLeadContact(
        {
          type: 'PUBLIC_BUSINESS_CONTACT',
          value: 'me@example.org',
          role: 'SALES_CONTACT',
          evidence: 'name@example.org',
        },
        'Contact name@example.org',
      ),
    ).toThrow('LEAD_CONTACT_NOT_LITERAL');
    const url = 'https://instagram.com/p/campaign';
    expect(() =>
      normalizeLeadContact(
        { type: 'INSTAGRAM', value: url, role: 'UNKNOWN', evidence: url },
        url,
      ),
    ).toThrow('LEAD_INSTAGRAM_PROFILE_INVALID');
    const profile = 'https://instagram.com/business.profile';
    expect(
      normalizeLeadContact(
        {
          type: 'INSTAGRAM',
          value: profile,
          role: 'UNKNOWN',
          evidence: profile,
        },
        profile,
      ).value,
    ).toBe('https://www.instagram.com/business.profile');
  });
  it('keeps only literal public links and rejects guessed Instagram destinations', () => {
    expect(
      literalLeadLinks(
        'See https://example.org/contact. https://user:pass@example.org/',
      ),
    ).toEqual(['https://example.org/contact']);
    expect(() =>
      normalizeLeadContact(
        {
          type: 'INSTAGRAM',
          value: 'https://instagram.com/fake',
          role: 'UNKNOWN',
          evidence: 'https://instagram.com/fake',
        },
        'https://instagram.com/real',
      ),
    ).toThrow();
  });
  it('imports at most100 bounded preview references with quoted CSV and no network calls', () => {
    expect(
      leadImportReferences(
        'reference,title\n"@channel_one","A, B"\nhttps://t.me/channel_two,Second',
        'CSV',
      ),
    ).toEqual(['@channel_one', 'https://t.me/channel_two']);
    expect(() =>
      leadImportReferences(
        Array.from({ length: 101 }, (_, i) => `@channel_${i}`).join('\n'),
        'TEXT',
      ),
    ).toThrow('LEAD_IMPORT_LIMIT');
    expect(() => leadImportReferences('"unterminated', 'CSV')).toThrow(
      'LEAD_CSV_INVALID',
    );
  });
  it('escapes formula injection for CSV and XLSX while preserving quoted Unicode text', () => {
    for (const text of ['=SUM(A1:A2)', ' +cmd', '\t@SUM(A1)', '-1+cmd'])
      expect(leadSpreadsheetText(text).startsWith("'")).toBe(true);
    expect(leadCsvCell('Назва "каналу"')).toBe('"Назва ""каналу"""');
    expect(leadSpreadsheetText('Звичайна назва')).toBe('Звичайна назва');
  });
  it('rejects malformed cursors and round-trips bounded opaque identities', () => {
    expect(decodeLeadCursor(leadCursor('lead_123'))).toBe('lead_123');
    expect(() => decodeLeadCursor('not valid')).toThrow('LEAD_CURSOR_INVALID');
  });
});
