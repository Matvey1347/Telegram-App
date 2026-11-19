import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelAvatarEmojiApi } from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import type {
  ChannelAvatarEmojiProcessorService,
  ChannelAvatarEmojiProcessOutcome,
} from '../domains/telegram/telegram-channels/channel-avatar-emoji-processor.service';
import type { AvatarEmojiMaintenanceOptions } from '../config/channel-avatar-emoji-maintenance';
import type { AvatarEmojiInventoryRow } from './channel-avatar-emoji-inventory';
import {
  avatarEmojiMigrationAction,
  runAvatarEmojiMigration,
} from './channel-avatar-emoji-migration';

const workspaceId = 'business-workspace';
const currentPrefix = 'local:nexeloq_system_bot:';
const oldBytes = Buffer.from('bounded immutable avatar bytes');
const oldImageUrl = `data:image/png;base64,${oldBytes.toString('base64')}`;

type Channel = AvatarEmojiInventoryRow & {
  workspaceId: string;
  selectedIconId: string | null;
  roles: Array<{ workspaceId: string; type: string; role: string }>;
};
const channel = (id: string, patch: Partial<Channel> = {}): Channel => ({
  id,
  title: `Channel ${id}`,
  workspaceId,
  owned: true,
  hasStoredAvatar: true,
  avatarEmojiIconId: null,
  avatarEmojiHash: null,
  avatarEmojiStatus: null,
  avatarEmojiManual: false,
  generatedIconName: null,
  generatedIconSource: null,
  selectedIconId: null,
  roles: [{ workspaceId, type: 'MTPROTO', role: 'OWNER' }],
  ...patch,
});
const legacy = (id: string, patch: Partial<Channel> = {}) =>
  channel(id, {
    avatarEmojiIconId: `legacy-${id}`,
    generatedIconName: 'channel-avatar:old-image-hash',
    generatedIconSource: '![📢](tg://emoji?id=12345)',
    avatarEmojiStatus: 'READY',
    ...patch,
  });
const current = (id: string) =>
  legacy(id, {
    generatedIconName: `channel-avatar:${currentPrefix}existing-hash`,
  });
const options = (
  patch: Partial<AvatarEmojiMaintenanceOptions> = {},
): AvatarEmojiMaintenanceOptions => ({
  mode: 'migrate',
  workspaceId,
  execute: false,
  production: false,
  limit: 100,
  ...patch,
});

function fixture(channels: Channel[], schemaReady = true) {
  const packs = [{ id: 1, shortName: 'legacy_by_dedicated_bot' }];
  const outcomes = new Map<string, ChannelAvatarEmojiProcessOutcome | Error>();
  const write = jest.fn(() => {
    throw new Error('Unexpected direct write');
  });
  const prisma = {
    workspace: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === workspaceId
            ? { id: workspaceId, name: 'Business' }
            : null,
        ),
      ),
    },
    $queryRaw: jest.fn((sql: TemplateStringsArray, ...values: unknown[]) => {
      if (sql.join('').includes('to_regclass'))
        return Promise.resolve([{ ready: schemaReady }]);
      const selectedWorkspace = values[0];
      const after = typeof values[2] === 'string' ? values[2] : '';
      const scoped = channels
        .filter((row) => row.workspaceId === selectedWorkspace)
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const remaining = scoped.filter((row) => row.id > after);
      return Promise.resolve(
        remaining.slice(0, Number(values.at(-1))).map((row) => ({
          ...row,
          totalCount: scoped.length,
          remainingCount: remaining.length,
          owned: row.roles.some(
            (role) =>
              role.workspaceId === row.workspaceId &&
              role.type === 'MTPROTO' &&
              role.role === 'OWNER',
          ),
        })),
      );
    }),
    $executeRaw: write,
    telegramChannel: {
      updateMany: write,
      findFirst: jest.fn(
        ({ where }: { where: { id: string; workspaceId: string } }) => {
          const row = channels.find(
            (item) =>
              item.id === where.id && item.workspaceId === where.workspaceId,
          );
          return Promise.resolve(
            row
              ? {
                  avatarEmojiStatus: row.avatarEmojiStatus,
                  avatarEmojiManual: row.avatarEmojiManual,
                  avatarEmojiIconId: row.avatarEmojiIconId,
                  presentationIconId: row.selectedIconId,
                  avatarEmojiIcon: row.generatedIconSource
                    ? { emoji: row.generatedIconSource }
                    : null,
                }
              : null,
          );
        },
      ),
    },
    channelAvatarEmojiAsset: {
      findUnique: jest.fn(() => Promise.resolve({ imageUrl: oldImageUrl })),
      create: write,
      update: write,
    },
    channelAvatarEmojiPack: {
      findMany: jest.fn(() => Promise.resolve([...packs])),
      create: write,
    },
  };
  const api = {
    assetKey: jest.fn((hash: string) => `${currentPrefix}${hash}`),
  };
  const processor = {
    process: jest.fn(
      (selectedWorkspace: string, id: string, input: unknown) => {
        void input;
        const row = channels.find(
          (item) => item.id === id && item.workspaceId === selectedWorkspace,
        );
        if (!row)
          return Promise.resolve<ChannelAvatarEmojiProcessOutcome>({
            status: 'NOT_OWNED',
          });
        const outcome = outcomes.get(id) ?? {
          status: 'READY' as const,
          customEmojiId: '67890',
          createdDocument: true,
          packId: 2,
        };
        if (outcome instanceof Error) return Promise.reject(outcome);
        row.avatarEmojiStatus = outcome.status;
        if (outcome.status === 'READY') {
          row.avatarEmojiIconId = `current-${id}`;
          row.generatedIconName = `channel-avatar:${currentPrefix}${id}`;
          row.generatedIconSource = `![📢](tg://emoji?id=${outcome.customEmojiId ?? '67890'})`;
          if (!row.avatarEmojiManual)
            row.selectedIconId = row.avatarEmojiIconId;
          if (!packs.some((pack) => pack.id === 2))
            packs.push({ id: 2, shortName: 'avatars_by_nexeloq_system_bot' });
        }
        return Promise.resolve(outcome);
      },
    ),
  };
  const run = (input: AvatarEmojiMaintenanceOptions = options()) =>
    runAvatarEmojiMigration(
      prisma as unknown as PrismaService,
      api as unknown as ChannelAvatarEmojiApi,
      processor as unknown as ChannelAvatarEmojiProcessorService,
      input,
    );
  return { channels, packs, outcomes, prisma, api, processor, write, run };
}

describe('one-shot channel avatar migration', () => {
  it('uses exact workspace and defaults to dry-run with no writes, processing or Telegram work', async () => {
    const f = fixture([
      legacy('owner'),
      legacy('foreign', { workspaceId: 'another-workspace' }),
    ]);
    const report = await f.run();
    expect(report).toMatchObject({
      dryRun: true,
      workspace: { id: workspaceId, name: 'Business' },
      counts: { considered: 1, processed: 0, createdEmoji: 0 },
    });
    expect(report.results).toMatchObject([
      { channelId: 'owner', action: 'MIGRATE' },
    ]);
    expect(f.prisma.workspace.findUnique.mock.calls[0][0].where).toEqual({
      id: workspaceId,
    });
    const query = f.prisma.$queryRaw.mock.calls.find(
      ([sql]) => !sql.join('').includes('to_regclass'),
    )!;
    expect(query.slice(1)).toEqual([
      workspaceId,
      workspaceId,
      '',
      workspaceId,
      '',
      100,
    ]);
    expect(query[0].join('')).toContain('a."workspaceId" = c."workspaceId"');
    expect(query[0].join('')).toContain('a."role" = \'OWNER\'');
    expect(f.processor.process).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
  });

  it('skips administrator-only, external and foreign-workspace owner evidence', async () => {
    const f = fixture([
      legacy('owner'),
      legacy('admin', {
        roles: [{ workspaceId, type: 'MTPROTO', role: 'ADMIN' }],
      }),
      legacy('external', { roles: [] }),
      legacy('foreign-evidence', {
        roles: [{ workspaceId: 'other', type: 'MTPROTO', role: 'OWNER' }],
      }),
      legacy('bot-owner', {
        roles: [{ workspaceId, type: 'BOT', role: 'OWNER' }],
      }),
    ]);
    const report = await f.run(options({ execute: true }));
    expect(report.counts).toMatchObject({
      considered: 5,
      owned: 1,
      processed: 1,
      skipped: 4,
    });
    expect(f.processor.process.mock.calls.map((call) => call[1])).toEqual([
      'owner',
    ]);
    expect(
      report.results.filter((row) => row.action === 'SKIP_NOT_OWNED'),
    ).toHaveLength(4);
  });

  it('skips a current namespaced version and never creates it again on repeated runs', async () => {
    const f = fixture([legacy('old'), current('already-current')]);
    const first = await f.run(options({ execute: true }));
    expect(first.counts).toMatchObject({
      processed: 1,
      createdEmoji: 1,
      skipped: 1,
    });
    const second = await f.run(options({ execute: true }));
    expect(second.counts).toMatchObject({
      processed: 0,
      createdEmoji: 0,
      skipped: 2,
    });
    expect(f.processor.process).toHaveBeenCalledTimes(1);
  });

  it('migrates immutable legacy bytes without asking for fresh MTProto photos and preserves manual selection', async () => {
    const f = fixture([
      legacy('manual', {
        avatarEmojiManual: true,
        selectedIconId: 'user-selected-icon',
      }),
    ]);
    const report = await f.run(options({ execute: true }));
    const [targetWorkspace, targetChannel, input] =
      f.processor.process.mock.calls[0];
    expect([targetWorkspace, targetChannel]).toEqual([workspaceId, 'manual']);
    expect(input).toEqual({
      admit: true,
      scheduleRetry: false,
      preparedImage: {
        hash: createHash('sha256').update(oldBytes).digest('hex'),
        png: oldBytes,
        imageUrl: oldImageUrl,
      },
    });
    expect(report.results).toMatchObject([
      {
        databaseStatus: 'READY',
        documentId: '67890',
        selectedIconId: 'user-selected-icon',
        manualSelection: true,
      },
    ]);
    expect(report.createdPacks).toEqual([
      { id: 2, shortName: 'avatars_by_nexeloq_system_bot' },
    ]);
    expect(f.write).not.toHaveBeenCalled();
  });

  it('counts per-channel created/reused/error/no-avatar/busy outcomes without aborting remaining channels', async () => {
    const f = fixture(
      ['created', 'reused', 'failed', 'empty', 'busy'].map((id) => legacy(id)),
    );
    f.outcomes.set('reused', {
      status: 'READY',
      customEmojiId: '67891',
      createdDocument: false,
      packId: 2,
    });
    f.outcomes.set('failed', new Error('Transient request failed'));
    f.outcomes.set('empty', { status: 'NO_AVATAR' });
    f.outcomes.set('busy', { status: 'BUSY' });
    const report = await f.run(options({ execute: true }));
    expect(report.counts).toMatchObject({
      processed: 2,
      createdEmoji: 1,
      reusedEmoji: 1,
      skipped: 1,
      errors: 2,
    });
    const failed = report.results.find((row) => row.channelId === 'failed');
    expect(failed?.status).toBe('ERROR');
    expect(failed?.error).toEqual(
      expect.stringContaining('credentials and remote errors are not printed'),
    );
    expect(f.processor.process).toHaveBeenCalledTimes(5);
  });

  it('rejects missing schema before execution but allows its read-only planning', async () => {
    const f = fixture([legacy('owner')], false);
    await expect(f.run(options())).resolves.toMatchObject({
      dryRun: true,
      schemaReady: false,
    });
    await expect(f.run(options({ execute: true }))).rejects.toThrow(
      'tracked avatar schema migration',
    );
    expect(f.processor.process).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
  });

  it('skips proven no-avatar backfill and migration without a legacy binding', () => {
    const f = fixture([]);
    expect(
      avatarEmojiMigrationAction(
        channel('new'),
        f.api as unknown as ChannelAvatarEmojiApi,
        'migrate',
      ),
    ).toBe('SKIP_NO_LEGACY_BINDING');
    expect(
      avatarEmojiMigrationAction(
        channel('empty', {
          avatarEmojiStatus: 'NO_AVATAR',
          hasStoredAvatar: false,
        }),
        f.api as unknown as ChannelAvatarEmojiApi,
        'backfill',
      ),
    ).toBe('SKIP_NO_AVATAR');
    expect(
      avatarEmojiMigrationAction(
        channel('new'),
        f.api as unknown as ChannelAvatarEmojiApi,
        'backfill',
      ),
    ).toBe('BACKFILL');
  });

  it('keeps a channel failure local when immutable legacy bytes are unavailable', async () => {
    const f = fixture([legacy('missing-bytes')]);
    f.prisma.channelAvatarEmojiAsset.findUnique.mockResolvedValue(
      null as never,
    );
    const report = await f.run(options({ execute: true }));
    expect(report.counts).toMatchObject({ errors: 1, processed: 0 });
    expect(f.processor.process).not.toHaveBeenCalled();
  });
  it('reports a stable resume cursor instead of silently omitting channels beyond the limit', async () => {
    const f = fixture([legacy('alpha'), legacy('beta'), legacy('gamma')]);
    const first = await f.run(options({ limit: 2 }));
    expect(first.pagination).toEqual({
      totalChannels: 3,
      remainingChannels: 3,
      limit: 2,
      nextCursor: 'beta',
      truncated: true,
    });
    expect(first.results.map((row) => row.channelId)).toEqual([
      'alpha',
      'beta',
    ]);
    const next = await f.run(options({ limit: 2, after: 'beta' }));
    expect(next.pagination).toEqual({
      totalChannels: 3,
      remainingChannels: 1,
      limit: 2,
      nextCursor: null,
      truncated: false,
    });
    expect(next.results.map((row) => row.channelId)).toEqual(['gamma']);
    expect(f.processor.process).not.toHaveBeenCalled();
  });

  it.each(['missing', 'error', 'different-document'])(
    'does not count a stale READY result when the authoritative binding is %s',
    async (state) => {
      const f = fixture([legacy('owner')]);
      f.prisma.telegramChannel.findFirst.mockResolvedValue(
        state === 'missing'
          ? null
          : {
              avatarEmojiStatus: state === 'error' ? 'ERROR' : 'READY',
              avatarEmojiManual: false,
              avatarEmojiIconId: 'changed',
              presentationIconId: 'changed',
              avatarEmojiIcon: { emoji: '![📢](tg://emoji?id=98765)' },
            },
      );
      const report = await f.run(options({ execute: true }));
      expect(report.counts).toMatchObject({
        processed: 0,
        createdEmoji: 0,
        errors: 1,
      });
      expect(report.results[0]).toMatchObject({
        status: 'ERROR',
        databaseVerified: false,
      });
      expect(report.results[0].documentId).toBe(
        state === 'missing' ? null : '98765',
      );
    },
  );

  it('rejects an unknown exact workspace without scanning or processing another workspace', async () => {
    const f = fixture([legacy('owner')]);
    await expect(
      f.run(options({ workspaceId: 'unknown-workspace' })),
    ).rejects.toThrow('Workspace not found');
    expect(f.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(f.processor.process).not.toHaveBeenCalled();
  });
});
