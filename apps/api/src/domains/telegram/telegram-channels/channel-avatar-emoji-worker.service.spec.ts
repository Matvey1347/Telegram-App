/* eslint-disable @typescript-eslint/require-await -- Stateful async port mocks deliberately complete synchronously. */
import 'reflect-metadata';
import { Logger, Scope } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { scheduledTaskWakeNotifier } from '../../../common/scheduled-task-wake-notifier';
import { ChannelAvatarEmojiApi } from '@api/telegram/shared/emoji/channel-avatar-emoji-api';
import { ChannelAvatarEmojiService } from './channel-avatar-emoji.service';
import { ChannelAvatarEmojiProcessorService } from './channel-avatar-emoji-processor.service';
import { ChannelAvatarEmojiWorkerService } from './channel-avatar-emoji-worker.service';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('avatar emoji worker lifecycle', () => {
  async function setup(configured = true) {
    let next: {
      id: string;
      workspaceId: string;
      avatarEmojiRetryAt: Date;
    } | null = null;
    const findFirst = jest.fn(async () => next);
    const process = jest.fn(async () => {
      next = null;
    });
    const module = await Test.createTestingModule({
      providers: [
        ChannelAvatarEmojiWorkerService,
        {
          provide: PrismaService,
          useValue: { telegramChannel: { findFirst } },
        },
        {
          provide: ChannelAvatarEmojiApi,
          useValue: { configured: () => configured },
        },
        { provide: ChannelAvatarEmojiProcessorService, useValue: { process } },
        // The HTTP facade may remain request-scoped; the worker does not depend on it.
        {
          provide: ChannelAvatarEmojiService,
          scope: Scope.REQUEST,
          useFactory: () => ({}),
        },
      ],
    }).compile();
    return {
      module,
      findFirst,
      process,
      setNext: (value: typeof next) => {
        next = value;
      },
    };
  }

  it('starts and recovers due work independently of the request-scoped HTTP facade', async () => {
    const env = await setup();
    env.setNext({
      id: 'persisted',
      workspaceId: 'workspace',
      avatarEmojiRetryAt: new Date(0),
    });
    try {
      await env.module.init();
      await flush();
      expect(env.process).toHaveBeenCalledWith('workspace', 'persisted');
      expect(env.findFirst).toHaveBeenCalledTimes(2);
      await flush();
      expect(env.findFirst).toHaveBeenCalledTimes(2); // no idle polling
    } finally {
      await env.module.close();
    }
  });

  it('does not keep polling when the avatar schema is not deployed', async () => {
    const env = await setup();
    env.findFirst.mockRejectedValue({ code: 'P2022' });
    const warning = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const timer = jest.spyOn(globalThis, 'setTimeout');
    try {
      await env.module.init();
      await flush();
      await flush();
      expect(env.findFirst).toHaveBeenCalledTimes(1);
      expect(env.process).not.toHaveBeenCalled();
      expect(timer).not.toHaveBeenCalled();
    } finally {
      await env.module.close();
      warning.mockRestore();
      timer.mockRestore();
    }
  });

  it('disabled configuration does not read the database or start work', async () => {
    const env = await setup(false);
    try {
      await env.module.init();
      await flush();
      scheduledTaskWakeNotifier.emit('changed', 'channel-avatar-emoji');
      await flush();
      expect(env.findFirst).not.toHaveBeenCalled();
      expect(env.process).not.toHaveBeenCalled();
    } finally {
      await env.module.close();
    }
  });

  it('does not lose an enqueue signal arriving during an empty query', async () => {
    const env = await setup();
    let release!: () => void;
    env.findFirst.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(null);
        }),
    );
    try {
      await env.module.init();
      await flush();
      env.setNext({
        id: 'fresh',
        workspaceId: 'owner',
        avatarEmojiRetryAt: new Date(0),
      });
      scheduledTaskWakeNotifier.emit('changed', 'channel-avatar-emoji');
      release();
      await flush();
      await flush();
      expect(env.process).toHaveBeenCalledWith('owner', 'fresh');
    } finally {
      await env.module.close();
    }
  });
});
