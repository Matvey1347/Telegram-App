const firstArgument = (mock: { mock: { calls: unknown[][] } }): unknown =>
  mock.mock.calls[0]?.[0];
import { Prisma } from '@prisma/client';
import type { TelegramLeadChannel } from '../../../../telegram/shared/mtproto/telegram-lead-channel.types';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramCrmRuntimeManager } from '../telegram-crm-runtime-manager.service';
import { TelegramLeadTransportEvents } from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadIngestService } from './lead-ingest.service';
import { TelegramLeadTransportService } from './lead-transport.service';
import { leadSource } from './lead.spec-fixtures';
function fixture() {
  const source = leadSource();
  const channel: TelegramLeadChannel = {
    channelId: '12345',
    username: 'source_channel',
    title: 'Reviewed source',
    url: 'https://t.me/source_channel',
    pts: 100,
    subscribed: true,
  };
  const transport = {
    list: jest.fn().mockResolvedValue({
      items: [
        channel,
        {
          ...channel,
          channelId: '22222',
          username: 'private_source',
          title: 'Private reviewed source',
        },
      ],
      nextCursor: 'opaque-cursor',
      hasMore: true,
    }),
    resolve: jest.fn().mockResolvedValue(channel),
    history: jest.fn().mockResolvedValue({
      items: [
        {
          channelId: '12345',
          messageId: 1,
          text: 'Пропозиція для бізнесу',
          publishedAt: new Date(),
          editedAt: null,
        },
      ],
      hasMore: true,
      nextBeforeId: 1,
    }),
    recover: jest.fn().mockResolvedValue({
      posts: [],
      deletedIds: [],
      pts: 110,
      final: true,
      tooLong: false,
    }),
  };
  const handle = { leadDiscovery: transport },
    runtime = {
      liveAccountIds: jest.fn().mockReturnValue(['account']),
      withLiveAccountHandle: jest.fn(
        (
          _workspace: string,
          _account: string,
          operation: (port: typeof handle) => Promise<unknown>,
        ) => operation(handle),
      ),
    };
  const prisma = {
    telegramUserAccountIntegration: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'account', label: 'Account' }]),
    },
    telegramChannel: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { telegramChatId: '-10012345', username: 'source_channel' },
        ]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    telegramLeadSource: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const policy = {
      access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
      account: jest
        .fn()
        .mockResolvedValue({ id: 'account', workspaceId: 'workspace' }),
      source: jest.fn().mockResolvedValue(source),
      enabled: jest.fn().mockReturnValue(true),
      granted: jest.fn().mockReturnValue(true),
      assertProcessing: jest.fn(),
      refresh: jest.fn().mockResolvedValue(undefined),
    },
    ingest = {
      ingest: jest.fn().mockResolvedValue({
        received: 0,
        changed: 0,
        unchanged: 0,
        filtered: 0,
        gap: false,
      }),
    },
    read = { source: jest.fn().mockResolvedValue({ id: 'source' }) },
    events = {
      refresh: jest.fn(),
      beginRecovery: jest.fn().mockReturnValue(jest.fn()),
    };
  const service = new TelegramLeadTransportService(
    prisma as unknown as PrismaService,
    policy as unknown as TelegramLeadPolicy,
    runtime as unknown as TelegramCrmRuntimeManager,
    ingest as unknown as TelegramLeadIngestService,
    read as unknown as TelegramLeadReadService,
    events as unknown as TelegramLeadTransportEvents,
  );
  return {
    service,
    source,
    channel,
    transport,
    runtime,
    prisma,
    policy,
    ingest,
    events,
  };
}
describe('Lead reuse of already-live channel transport', () => {
  it('requires manager account visibility and excludes own catalog channels without exposing channel secrets', async () => {
    const h = fixture();
    expect(await h.service.accounts('manager')).toEqual([
      { id: 'account', label: 'Account', live: true },
    ]);
    expect(h.policy.access).toHaveBeenCalledWith('manager', 'manage');
    const result = await h.service.channels('manager', 'account', {
      limit: 25,
    });
    expect(result.items.map((row) => row.channelId)).toEqual(['22222']);
    expect(result.hasMore).toBe(true);
    expect(JSON.stringify(result)).not.toContain('pts');
    expect(JSON.stringify(result)).not.toContain('subscribed');
    expect(h.runtime.withLiveAccountHandle).toHaveBeenCalledTimes(1);
  });
  it('refuses disabled feature listing and unavailable runtime without creating another handle', async () => {
    const h = fixture();
    h.policy.enabled.mockReturnValue(false);
    await expect(h.service.channels('manager', 'account', {})).rejects.toThrow(
      'LEAD_DISCOVERY_DISABLED',
    );
    expect(h.runtime.withLiveAccountHandle).not.toHaveBeenCalled();
    const offline = fixture();
    offline.runtime.withLiveAccountHandle.mockRejectedValue(
      new Error('not live'),
    );
    await expect(
      offline.service.channels('manager', 'account', {}),
    ).rejects.toThrow('not live');
    expect(offline.transport.list).not.toHaveBeenCalled();
  });
  it('allows explicit metadata validation after ACCESS_LOST, but never retargets a known Telegram ID', async () => {
    const h = fixture();
    h.source.monitoringState = 'ACCESS_LOST';
    expect(await h.service.validate('manager', 'source')).toEqual({
      id: 'source',
    });
    expect(h.policy.assertProcessing).not.toHaveBeenCalled();
    expect(h.prisma.telegramLeadSource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ monitoringState: 'PAUSED' }) as unknown,
      }),
    );
    const changed = fixture();
    changed.transport.resolve.mockResolvedValue({
      ...changed.channel,
      channelId: '99999',
    });
    await expect(changed.service.validate('manager', 'source')).rejects.toThrow(
      'LEAD_SOURCE_IDENTITY_CHANGED',
    );
    const data: unknown = firstArgument(
      changed.prisma.telegramLeadSource.updateMany,
    );
    expect(JSON.stringify(data)).not.toContain('99999');
  });
  it('exposes only the resolved identity for an approved metadata-only bootstrap without reading content', async () => {
    const h = fixture();
    h.source.channelId = null;
    h.policy.granted.mockImplementation((_source: unknown, _mode: unknown, metadata?: boolean) => metadata === true);
    await expect(h.service.validate('manager', 'source')).rejects.toMatchObject({
      response: { message: 'LEAD_RESOLVED_CHANNEL_NOT_APPROVED', details: { resolvedChannelId: h.channel.channelId } },
    });
    expect(h.transport.history).not.toHaveBeenCalled();
    expect(h.prisma.telegramLeadSource.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ channelId: h.channel.channelId }) }));
  });
  it('requires channel-ID-specific processing approval after resolution and reports canonical duplicates safely', async () => {
    const h = fixture();
    h.policy.granted.mockImplementation(
      (_source: unknown, _mode: unknown, metadata?: boolean) =>
        metadata === true,
    );
    await expect(h.service.validate('manager', 'source')).rejects.toThrow(
      'LEAD_RESOLVED_CHANNEL_NOT_APPROVED',
    );
    const duplicate = fixture();
    duplicate.source.channelId = null;
    duplicate.prisma.telegramLeadSource.updateMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      duplicate.service.validate('manager', 'source'),
    ).rejects.toThrow('LEAD_SOURCE_CANONICAL_DUPLICATE');
  });
  it('resolves a pending private URL while retaining its custom topic label and invite', async () => {
    const h = fixture();
    h.source.channelId = null;
    h.source.username = null;
    h.source.title = 'ИИ — вне основной тематики';
    h.source.url = 'https://t.me/+synthetic_private-source';
    h.transport.resolve.mockResolvedValue({
      ...h.channel,
      username: null,
      url: null,
    });
    await h.service.validate('manager', 'source');
    expect(h.transport.resolve).toHaveBeenCalledWith(h.source.url);
    const query = firstArgument(h.prisma.telegramLeadSource.updateMany) as {
      data: Record<string, unknown>;
    };
    expect(query.data).toMatchObject({
      channelId: h.channel.channelId,
      url: h.source.url,
    });
    expect(query.data).not.toHaveProperty('title');
  });
  it('pauses a source that is no longer subscribed and removes its continuous coverage claim', async () => {
    const h = fixture();
    h.channel.subscribed = false;
    await h.service.validate('manager', 'source');
    const query = firstArgument(h.prisma.telegramLeadSource.updateMany) as {
      data: {
        monitoringState: string;
        coverageState: string;
        accessType: string;
      };
    };
    expect(query.data).toMatchObject({
      monitoringState: 'PAUSED',
      coverageState: 'GAPPED',
      accessType: 'PUBLIC_CHANNEL',
    });
  });
  it('performs one bounded scan with cursor and no implicit history drain', async () => {
    const h = fixture();
    const result = await h.service.scan('manager', 'source', {
      limit: 50,
      beforeId: 55,
    });
    expect(result).toMatchObject({ hasMore: true, nextBeforeId: 1 });
    expect(h.transport.history).toHaveBeenCalledWith('12345', {
      limit: 50,
      beforeId: 55,
      reference: h.source.username ?? undefined,
    });
    expect(h.transport.history).toHaveBeenCalledTimes(1);
    expect(h.ingest.ingest).toHaveBeenCalledTimes(1);
  });
  it('delegates even empty final recovery to locked atomic ingestion and never writes its own stale checkpoint', async () => {
    const h = fixture();
    await h.service.recover('manager', 'source');
    expect(h.ingest.ingest).toHaveBeenCalledWith(
      'manager',
      'source',
      [],
      expect.objectContaining({
        recovery: true,
        gap: false,
        recoveryCheckpoint: expect.objectContaining({
          sourceId: 'source',
          startingPts: 100,
          pts: 110,
          complete: true,
          capturedAt: expect.any(Date) as unknown,
        }) as unknown,
      }),
    );
    expect(h.prisma.telegramLeadSource.updateMany).not.toHaveBeenCalled();
    expect(h.transport.recover).toHaveBeenCalledTimes(1);
  });
});
