import { EventEmitter } from 'node:events';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import type { RescheduleChannelScheduledPostProgress } from '@telegram-system/shared';
import { RequestContextService } from '../common/request-context/request-context.service';
import { StreamResponseService } from '../common/stream/stream-response.service';
import { ProductionRecoveryController } from './production-recovery.controller';

jest.mock('../config/production-recovery-config', () => ({
  productionRecoveryConfig: () => ({
    channelId: 'channel-selected',
    workspaceId: 'workspace-selected',
    userId: 'user-member',
  }),
}));

const user = { sub: 'user-member', email: 'member@example.test' };

function responseHarness() {
  const chunks: string[] = [];
  const headers = new Map<string, unknown>();
  const emitter = new EventEmitter();
  const response = Object.assign(emitter, {
    destroyed: false,
    writableEnded: false,
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn((name: string, value: unknown) =>
      headers.set(name, value),
    ),
    flushHeaders: jest.fn(),
    write: jest.fn((value: string) => chunks.push(value)),
    end: jest.fn((value?: Buffer) => {
      if (value) chunks.push(value.toString());
      response.writableEnded = true;
    }),
  });
  return { response: response as unknown as Response, chunks, headers };
}

function harness() {
  const rescheduler = {
    listChannelRescheduleCandidates: jest.fn(),
    rescheduleChannelScheduledPosts: jest.fn(),
  };
  const snapshot = { snapshot: jest.fn() };
  const workspace = {
    requireWorkspaceRole: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace-selected' }),
  };
  const streams = new StreamResponseService(
    { writeStructured: jest.fn() } as never,
    new RequestContextService(),
  );
  const commands = { createManagedPost: jest.fn() };
  const history = { updateManagedPost: jest.fn() };
  const controller = new ProductionRecoveryController(
    rescheduler as never,
    snapshot as never,
    streams,
    workspace as never,
    commands as never,
    history as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
    { postRevision: async () => ({ revision: "2026-11-21T08:00:00.000Z" }), selectedPlacementForPost: async () => undefined } as never,
    {} as never,
  );
  return { controller, rescheduler, snapshot, workspace, commands, history };
}

describe('ProductionRecoveryController', () => {
  afterEach(() => jest.restoreAllMocks());

  it('gets the plan from the injected local rescheduler without a remote action', async () => {
    const { controller, rescheduler } = harness();
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    rescheduler.listChannelRescheduleCandidates.mockResolvedValue({
      channelId: 'channel-selected',
      postIds: ['post-a', 'post-b'],
    });
    await expect(controller.plan(user, 'channel-selected')).resolves.toEqual({
      channelId: 'channel-selected',
      postIds: ['post-a', 'post-b'],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['channel-other', ''])(
    'rejects a different channel %p before work',
    async (channelId) => {
      const { controller, rescheduler } = harness();
      await expect(controller.plan(user, channelId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(
        rescheduler.listChannelRescheduleCandidates,
      ).not.toHaveBeenCalled();
    },
  );

  it('rejects a different workspace before starting the recovery stream', async () => {
    const { controller, rescheduler, workspace } = harness();
    workspace.requireWorkspaceRole.mockResolvedValue({
      workspaceId: 'workspace-other',
    });
    const { response, chunks } = responseHarness();
    await expect(
      controller.reschedule(
        user,
        'channel-selected',
        { postIds: ['post-a'] },
        response,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(chunks).toEqual([]);
    expect(rescheduler.rescheduleChannelScheduledPosts).not.toHaveBeenCalled();
  });

  it('streams progress and the actual local result for the requested post batch', async () => {
    const { controller, rescheduler } = harness();
    const { response, chunks } = responseHarness();
    rescheduler.rescheduleChannelScheduledPosts.mockImplementation(
      (
        _user: string,
        _channel: string,
        progress: (
          item: RescheduleChannelScheduledPostProgress,
          current: number,
          total: number,
        ) => void,
        postIds: string[],
      ) => {
        expect(postIds).toEqual(['post-a', 'post-b']);
        progress(
          { postId: 'post-a', stage: 'NATIVE_SCHEDULE_PRESERVED' },
          1,
          2,
        );
        progress({ postId: 'post-b', stage: 'RESCHEDULED' }, 2, 2);
        return Promise.resolve({
          nativelyScheduledCount: 1,
          rescheduledCount: 1,
          failedCount: 0,
        });
      },
    );
    await controller.reschedule(
      user,
      'channel-selected',
      { postIds: ['post-a', 'post-b'] },
      response,
    );
    expect(chunks.map((chunk) => JSON.parse(chunk) as unknown)).toEqual([
      {
        type: 'progress',
        item: { postId: 'post-a', stage: 'NATIVE_SCHEDULE_PRESERVED' },
        current: 1,
        total: 2,
      },
      {
        type: 'progress',
        item: { postId: 'post-b', stage: 'RESCHEDULED' },
        current: 2,
        total: 2,
      },
      {
        type: 'complete',
        result: {
          nativelyScheduledCount: 1,
          rescheduledCount: 1,
          failedCount: 0,
        },
      },
    ]);
    expect(response.writableEnded).toBe(true);
  });

  it('reports a local failure without a false completed result', async () => {
    const { controller, rescheduler } = harness();
    const { response, chunks } = responseHarness();
    rescheduler.rescheduleChannelScheduledPosts.mockRejectedValue(
      new Error('Transport unavailable'),
    );
    await controller.reschedule(
      user,
      'channel-selected',
      { postIds: ['post-a'] },
      response,
    );
    const events = chunks.map((chunk) => JSON.parse(chunk) as unknown);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'error',
      message: 'Transport unavailable',
    });
    expect(response.writableEnded).toBe(true);
  });

  it('requires a named owner and nonempty exact recovery targets', async () => {
    const { controller, rescheduler } = harness();
    const { response } = responseHarness();
    await expect(
      controller.plan({ ...user, sub: 'different-user' }, 'channel-selected'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.reschedule(
        user,
        'channel-selected',
        { postIds: [] },
        response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rescheduler.rescheduleChannelScheduledPosts).not.toHaveBeenCalled();
  });

  it('delegates drafts to the canonical commands and enforces draft-only editing', async () => {
    const { controller, commands, history } = harness();
    commands.createManagedPost.mockResolvedValue({ id: 'draft' });
    history.updateManagedPost.mockResolvedValue({
      id: 'draft',
      title: 'Changed',
    });
    await expect(
      controller.createDraft(user, 'channel-selected', { title: 'Draft' }),
    ).resolves.toEqual({ id: 'draft' });
    await expect(
      controller.updateDraft(user, 'channel-selected', 'draft', {
        title: 'Changed',
      }, '2026-11-21T08:00:00.000Z'),
    ).resolves.toMatchObject({ title: 'Changed' });
    expect(history.updateManagedPost).toHaveBeenCalledWith(
      user.sub,
      'channel-selected',
      'draft',
      { title: 'Changed' },
      expect.objectContaining({ draftOnly: true }),
    );
  });
});
