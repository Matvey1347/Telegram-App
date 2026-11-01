import { Prisma } from '@prisma/client';
import type { LeadSourceInput } from '@telegram-system/shared';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TelegramLeadTransportEvents } from '../../../../telegram/shared/mtproto/telegram-lead-transport-events';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { TelegramLeadSourceService } from './lead-source.service';
import { leadSource } from './lead.spec-fixtures';
function fixture() {
  const source = leadSource({ monitoringState: 'PAUSED' }),
    existing: Array<{ normalizedKey: string; channelId?: string | null }> = [];
  const createMany = jest.fn(
    ({
      data,
    }: {
      data: Array<{ normalizedKey: string; monitoringState: string }>;
    }) => {
      existing.push(...data);
      return Promise.resolve({ count: data.length });
    },
  );
  const tx = {
    $executeRaw: jest.fn((sql: Prisma.Sql) => Promise.resolve(sql.sql ? 1 : 0)),
    telegramLeadSource: {
      findMany: jest.fn(() => Promise.resolve(existing)),
      count: jest.fn().mockResolvedValue(0),
      createMany,
    },
  };
  const prisma = {
    telegramUserAccountIntegration: {
      findMany: jest.fn().mockResolvedValue([{ id: 'account' }]),
    },
    telegramChannel: { findMany: jest.fn().mockResolvedValue([]) },
    telegramLeadSource: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(source, data);
        return Promise.resolve({ count: 1 });
      }),
    },
    $transaction: jest.fn(
      (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
    ),
  };
  const policy = {
      access: jest.fn().mockResolvedValue({ workspaceId: 'workspace' }),
      source: jest.fn().mockResolvedValue(source),
      account: jest.fn().mockResolvedValue({ id: 'account' }),
      granted: jest.fn().mockReturnValue(false),
      assertProcessing: jest.fn(),
    },
    read = { source: jest.fn().mockResolvedValue({ id: 'source' }) },
    events = { refresh: jest.fn() };
  const service = new TelegramLeadSourceService(
    prisma as unknown as PrismaService,
    policy as unknown as TelegramLeadPolicy,
    read as unknown as TelegramLeadReadService,
    events as unknown as TelegramLeadTransportEvents,
  );
  const input = (index = 0): LeadSourceInput => ({
    type: 'TELEGRAM_CHANNEL',
    reference: `@channel_${index}`,
    accountId: 'account',
    processingReference: 'policy:approved_source',
  });
  return { service, source, existing, tx, prisma, policy, read, events, input };
}
describe('Lead source registry and idempotent import', () => {
  it('imports100paused registry records in one batch without joins or one query per source', async () => {
    const h = fixture(),
      items = Array.from({ length: 100 }, (_, index) => h.input(index));
    expect(await h.service.import('manager', items)).toMatchObject({
      created: 100,
      existing: 0,
      errors: [],
    });
    expect(
      h.prisma.telegramUserAccountIntegration.findMany,
    ).toHaveBeenCalledTimes(1);
    expect(h.prisma.telegramChannel.findMany).toHaveBeenCalledTimes(1);
    expect(h.tx.telegramLeadSource.findMany).toHaveBeenCalledTimes(1);
    expect(h.tx.telegramLeadSource.createMany).toHaveBeenCalledTimes(1);
    expect(h.events.refresh).toHaveBeenCalledTimes(1);
    expect(
      h.tx.telegramLeadSource.createMany.mock.calls[0][0].data.every(
        (row) => row.monitoringState === 'PAUSED',
      ),
    ).toBe(true);
    expect(await h.service.import('manager', items)).toMatchObject({
      created: 0,
      existing: 100,
    });
    expect(h.tx.telegramLeadSource.createMany).toHaveBeenCalledTimes(1);
    expect(h.events.refresh).toHaveBeenCalledTimes(1);
  });
  it('enforces workspace source/import quotas before creating rows', async () => {
    const h = fixture();
    h.tx.telegramLeadSource.count.mockResolvedValue(1000);
    await expect(h.service.import('manager', [h.input()])).rejects.toThrow(
      'LEAD_SOURCE_LIMIT',
    );
    expect(h.tx.telegramLeadSource.createMany).not.toHaveBeenCalled();
    await expect(
      h.service.import(
        'manager',
        Array.from({ length: 101 }, () => h.input()),
      ),
    ).rejects.toThrow('LEAD_IMPORT_LIMIT');
  });
  it('reports invalid, inaccessible-account and own-channel sources without joining or approving processing', async () => {
    const h = fixture();
    h.prisma.telegramChannel.findMany.mockResolvedValue([
      { telegramChatId: '12345', username: 'channel_0' },
    ]);
    expect(await h.service.import('manager', [h.input()])).toMatchObject({
      created: 0,
      errors: [{ error: 'LEAD_OWN_CHANNEL_NOT_APPROVED' }],
    });
    const wrong = fixture();
    wrong.prisma.telegramUserAccountIntegration.findMany.mockResolvedValue([]);
    expect(
      await wrong.service.import('manager', [wrong.input()]),
    ).toMatchObject({
      created: 0,
      errors: [{ error: 'LEAD_ACCOUNT_NOT_FOUND' }],
    });
    const malformed = fixture();
    expect(
      await malformed.service.import('manager', [
        { ...malformed.input(), reference: 'https://t.me/+invalid/invite' },
      ]),
    ).toMatchObject({ created: 0, errors: [{ error: 'LEAD_SOURCE_INVALID' }] });
  });
  it('registers a private invite once without embedding the invite in its identity or title', async () => {
    const h = fixture();
    const input = {
      ...h.input(),
      reference: 'https://t.me/+synthetic_private-source',
    };
    expect(await h.service.import('manager', [input])).toMatchObject({
      created: 1,
      errors: [],
    });
    const row = h.tx.telegramLeadSource.createMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({
      title: 'Private Telegram channel',
      url: input.reference,
      channelId: null,
      monitoringState: 'PAUSED',
    });
    expect(row.normalizedKey).not.toContain('synthetic_private-source');
    expect(
      await h.service.import('manager', [
        {
          ...input,
          reference: 'https://telegram.me/joinchat/synthetic_private-source',
        },
      ]),
    ).toMatchObject({ created: 0, existing: 1 });
  });
  it('reports a resolved canonical channel duplicate without creating or joining another source', async () => {
    const h = fixture();
    h.existing.push({
      normalizedKey: 'telegram:username:old_name',
      channelId: '12345',
    });
    expect(
      await h.service.import('manager', [{ ...h.input(), reference: '12345' }]),
    ).toMatchObject({
      created: 0,
      existing: 0,
      errors: [{ error: 'LEAD_SOURCE_CANONICAL_DUPLICATE' }],
    });
    expect(h.tx.telegramLeadSource.createMany).not.toHaveBeenCalled();
  });
  it('withdraws own-channel monitoring approval with a scoped CAS and pauses until validation', async () => {
    const h = fixture();
    h.source.allowOwnChannel = true;
    h.source.monitoringState = 'ACTIVE';
    await h.service.patch('manager', 'source', { allowOwnChannel: false });
    expect(h.source).toMatchObject({
      allowOwnChannel: false,
      monitoringState: 'PAUSED',
      accessType: 'UNVERIFIED',
      coverageState: 'GAPPED',
    });
    expect(h.prisma.telegramLeadSource.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace',
          allowOwnChannel: true,
          updatedAt: expect.any(Date) as unknown,
        }) as unknown,
      }),
    );
  });
  it('does no unchanged setting writes and requires pause/revalidation for a new account', async () => {
    const h = fixture();
    await h.service.patch('manager', 'source', { monitoringState: 'PAUSED' });
    expect(h.prisma.telegramLeadSource.updateMany).not.toHaveBeenCalled();
    h.source.monitoringState = 'ACTIVE';
    await expect(
      h.service.patch('manager', 'source', { accountId: null }),
    ).rejects.toThrow('LEAD_PAUSE_AND_VALIDATE_NEW_ACCOUNT_FIRST');
    h.source.monitoringState = 'PAUSED';
    await h.service.patch('manager', 'source', { accountId: null });
    expect(h.source).toMatchObject({
      accountId: null,
      accessType: 'UNVERIFIED',
      coverageState: 'GAPPED',
      channelPts: null,
    });
  });
});
