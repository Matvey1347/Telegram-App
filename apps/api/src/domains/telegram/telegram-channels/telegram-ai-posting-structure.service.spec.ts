import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { TelegramAiPostingStructureService } from './telegram-ai-posting-structure.service';

describe('TelegramAiPostingStructureService', () => {
  const make = () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'channel-1' }]),
      postGroup: {
        findMany: jest.fn().mockResolvedValue([{ title: 'Existing' }]),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      telegramContentHypothesis: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ name: 'Existing hypothesis' }]),
        createMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      telegramChannel: {
        findFirst: jest.fn().mockResolvedValue({
          title: 'Channel',
          language: 'uk',
          shortDescription: null,
        }),
      },
      telegramAiPostingSettings: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      telegramPost: { findMany: jest.fn().mockResolvedValue([]) },
      postGroup: {
        findMany: jest.fn().mockResolvedValue([{ title: 'Existing' }]),
      },
      telegramContentHypothesis: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ name: 'Existing hypothesis' }]),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      ),
    };
    const workspace = {
      resolveWorkspaceMembershipForUser: jest
        .fn()
        .mockResolvedValue({ id: 'member-1', workspaceId: 'workspace-1' }),
    };
    const gateway = {
      execute: jest.fn().mockResolvedValue({
        operation: { status: 'SUCCEEDED' },
        result: {
          reply: JSON.stringify({
            groups: [
              'Existing',
              { name: 'New group', description: 'Practical examples' },
              'new GROUP',
            ],
            hypotheses: [
              'Existing hypothesis',
              { name: 'New hypothesis', description: 'Test audience response' },
            ],
          }),
        },
      }),
    };
    return {
      tx,
      prisma,
      workspace,
      gateway,
      service: new TelegramAiPostingStructureService(
        prisma as never,
        workspace as never,
        gateway as never,
      ),
    };
  };

  it('generates and creates only new names in the authorised channel', async () => {
    const { service, tx, prisma, gateway } = make();
    const result = await service.generate(
      'user-1',
      'channel-1',
      'Psychology',
      'uk',
    );
    expect(result).toEqual({
      groups: ['New group'],
      hypotheses: ['New hypothesis'],
    });
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'channel-1', workspaceId: 'workspace-1', isActive: true },
      }),
    );
    expect(gateway.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        category: 'TELEGRAM_POSTING_PLAN',
        aiPosting: {
          channelId: 'channel-1',
          postingMode: 'TEST',
          dailyBudget: null,
          monthlyBudget: null,
        },
      }),
    );
    expect(tx.postGroup.createMany).toHaveBeenCalledWith({
      data: [
        {
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          createdByMemberId: 'member-1',
          title: 'New group',
          description: 'Practical examples',
        },
      ],
    });
    expect(tx.telegramContentHypothesis.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          name: 'New hypothesis',
          description: 'Test audience response',
          status: 'ACTIVE',
        }),
      ],
    });
  });

  it('does not call AI for a channel outside the workspace', async () => {
    const { service, prisma, gateway } = make();
    prisma.telegramChannel.findFirst.mockResolvedValue(null);
    await expect(
      service.generate('user-1', 'foreign', '', ''),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.execute).not.toHaveBeenCalled();
  });

  it('rejects malformed AI output without creating records', async () => {
    const { service, gateway, tx } = make();
    gateway.execute.mockResolvedValue({
      operation: { status: 'SUCCEEDED' },
      result: { reply: '{"groups":"invalid"}' },
    });
    await expect(
      service.generate('user-1', 'channel-1', '', ''),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(tx.postGroup.createMany).not.toHaveBeenCalled();
    expect(tx.telegramContentHypothesis.createMany).not.toHaveBeenCalled();
  });

  it('does not write when the channel is deactivated while AI is running', async () => {
    const { service, tx } = make();
    tx.$queryRaw.mockResolvedValue([]);
    await expect(
      service.generate('user-1', 'channel-1', '', ''),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.postGroup.createMany).not.toHaveBeenCalled();
    expect(tx.telegramContentHypothesis.createMany).not.toHaveBeenCalled();
  });

  it('creates absent names only when their individual switches are enabled', async () => {
    const { service, tx } = make();
    tx.postGroup.findFirst.mockResolvedValue(null);
    tx.telegramContentHypothesis.findFirst.mockResolvedValue(null);
    tx.postGroup.create.mockResolvedValue({ id: 'group-1' });
    const result = await service.resolveForDraft(tx as never, {
      workspaceId: 'workspace-1',
      channelId: 'channel-1',
      memberId: 'member-1',
      format: 'New group',
      category: 'New hypothesis',
      allowGroups: true,
      allowHypotheses: false,
    });
    expect(result).toEqual({ groupId: 'group-1', hypothesisId: null });
    expect(tx.postGroup.create).toHaveBeenCalledTimes(1);
    expect(tx.telegramContentHypothesis.create).not.toHaveBeenCalled();
    expect(tx.postGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: 'workspace-1',
          telegramChannelId: 'channel-1',
          title: { equals: 'New group', mode: 'insensitive' },
        },
      }),
    );
  });

  it('reuses existing records even when automatic creation is disabled', async () => {
    const { service, tx } = make();
    tx.postGroup.findFirst.mockResolvedValue({ id: 'group-existing' });
    tx.telegramContentHypothesis.findFirst.mockResolvedValue({
      id: 'hypothesis-existing',
    });
    await expect(
      service.resolveForDraft(tx as never, {
        workspaceId: 'workspace-1',
        channelId: 'channel-1',
        memberId: 'member-1',
        format: 'Existing',
        category: 'Existing hypothesis',
        allowGroups: false,
        allowHypotheses: false,
      }),
    ).resolves.toEqual({
      groupId: 'group-existing',
      hypothesisId: 'hypothesis-existing',
    });
    expect(tx.postGroup.create).not.toHaveBeenCalled();
    expect(tx.telegramContentHypothesis.create).not.toHaveBeenCalled();
  });
});
