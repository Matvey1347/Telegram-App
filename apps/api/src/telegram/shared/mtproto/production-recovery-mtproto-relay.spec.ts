import { ProductionRecoveryMtprotoRelay } from './production-recovery-mtproto-relay';
import { rescheduleContext } from '../../../domains/telegram/telegram-channels/telegram-managed-post-rescheduler.remote';
import type { PrismaService } from '../../../prisma/prisma.service';
import {
  recoveryAccountMarker,
  recoveryAuthorization,
} from './production-recovery-relay-context';

jest.mock('../../../config/production-recovery-config', () => ({
  productionRecoveryConfig: () => ({
    workspaceId: 'workspace',
    channelId: 'channel',
    productionApiOrigin: 'https://owner.example/api',
  }),
}));

describe('localhost owner transport', () => {
  const credentials = {
    apiId: '0',
    apiHash: recoveryAccountMarker,
    session: 'account',
  };
  const scheduledAt = new Date(Date.now() + 600_000);
  const originalFetch = global.fetch;
  const harness = () => {
    const prisma = {
      telegramManagedPost: {
        findFirst: jest.fn().mockResolvedValue({ id: 'post', scheduledAt }),
      },
    };
    return new ProductionRecoveryMtprotoRelay(
      prisma as unknown as PrismaService,
    );
  };
  const admitted = <T>(action: () => T) =>
    recoveryAuthorization.run('Bearer fixture-token', action);
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends account IDs rather than credentials or caller channel references', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => ({ result: [{ id: '42' }] }),
    });
    global.fetch = fetch;
    const relay = harness();
    await expect(
      admitted(() =>
        relay.getScheduledHistory({ ...credentials, channelRef: '@ignored' }),
      ),
    ).resolves.toEqual([{ id: '42' }]);
    const options = (fetch.mock.calls as unknown[][])[0][1] as RequestInit;
    expect(JSON.parse(options.body as string)).toEqual({
      operation: 'scheduled',
      accountId: 'account',
    });
    expect(options.body).not.toContain(recoveryAccountMarker);
    expect(options.headers).toMatchObject({
      authorization: 'Bearer fixture-token',
    });
  });

  it('rejects requests outside the admitted browser context or with raw account credentials', async () => {
    const fetch = jest.fn();
    global.fetch = fetch;
    const relay = harness();
    await expect(
      relay.getScheduledHistory({ ...credentials, channelRef: '@ignored' }),
    ).rejects.toThrow('admitted operator');
    await expect(
      admitted(() =>
        relay.getScheduledHistory({
          ...credentials,
          apiHash: 'mock-raw-value',
          channelRef: '@ignored',
        }),
      ),
    ).rejects.toThrow('linked account ID');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never retries a lost mutation response and leaves the claim to its caller', async () => {
    const fetch = jest
      .fn()
      .mockRejectedValue(new Error('Connection reset after acceptance'));
    global.fetch = fetch;
    const relay = harness();
    await expect(
      admitted(() =>
        rescheduleContext.run(
          { owner: 'claim', signal: new AbortController().signal },
          () =>
            relay.publishPost({
              ...credentials,
              channelRef: '@ignored',
              html: 'Body',
              imageUrls: [],
              scheduleAt: scheduledAt,
            }),
        ),
      ),
    ).rejects.toThrow('Connection reset');
    expect(fetch).toHaveBeenCalledTimes(1);
    const options = (fetch.mock.calls as unknown[][])[0][1] as RequestInit;
    expect(JSON.parse(options.body as string)).toMatchObject({
      operation: 'publish',
      postId: 'post',
      claimOwner: 'claim',
      scheduleAt: scheduledAt.toISOString(),
    });
  });

  it('rejects a mutation before HTTP when no live local claim exists', async () => {
    const fetch = jest.fn();
    global.fetch = fetch;
    await expect(
      admitted(() =>
        harness().deleteScheduledPost({ ...credentials, messageIds: ['42'] }),
      ),
    ).rejects.toThrow('active reschedule claim');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends one combined replacement with exact IDs and never serializes local callbacks', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => ({ result: ['replacement-id'] }),
    });
    global.fetch = fetch;
    const beforeChange = jest.fn();
    const validate = jest.fn();
    const afterCancel = jest.fn();
    const result = await admitted(() =>
      rescheduleContext.run(
        { owner: 'claim', signal: new AbortController().signal },
        () =>
          harness().publishPost({
            ...credentials,
            html: 'Body',
            imageUrls: [],
            scheduleAt: scheduledAt,
            replacement: {
              messageIds: ['old-id'],
              beforeChange,
              validate,
              afterCancel,
            },
          }),
      ),
    );
    expect(result).toEqual(['replacement-id']);
    expect(fetch).toHaveBeenCalledTimes(1);
    const options = (fetch.mock.calls as unknown[][])[0][1] as RequestInit;
    expect(JSON.parse(options.body as string)).toEqual({
      operation: 'replace',
      accountId: 'account',
      postId: 'post',
      claimOwner: 'claim',
      scheduleAt: scheduledAt.toISOString(),
      messageIds: ['old-id'],
      data: { html: 'Body', imageUrls: [] },
    });
    expect(beforeChange).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(afterCancel).not.toHaveBeenCalled();
    expect(options.body).not.toContain(recoveryAccountMarker);
  });
});
