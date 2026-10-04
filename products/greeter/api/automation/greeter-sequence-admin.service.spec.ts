import { ConflictException } from '@nestjs/common';
import { GreeterSequenceAdminService } from './greeter-sequence-admin.service';

describe('GreeterSequenceAdminService', () => {
  it.each(['javascript:alert(1)', 'data:text/plain,no', 'file:///tmp/no'])(
    'rejects the unsafe button URL %s',
    (url) => {
      expect(() =>
        GreeterSequenceAdminService.validateButtons([[{ text: 'Open', url }]]),
      ).toThrow('Button URL must use http(s) or tg');
    },
  );

  it('fences publish against the expected draft revision', async () => {
    const sequence = {
      id: 'sequence-1',
      workspaceId: 'workspace-1',
      botIntegrationId: 'bot-1',
      draftRevision: 4,
    };
    const tx = {
      greeterSequence: {
        findUnique: jest.fn().mockResolvedValue({
          ...sequence,
          draftSteps: [{ id: 'draft-step' }],
          versions: [],
        }),
      },
      greeterSequenceVersion: { create: jest.fn() },
      greeterSequenceStep: { createMany: jest.fn() },
    };
    const prisma = {
      greeterSequence: { findFirst: jest.fn().mockResolvedValue(sequence) },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const admin = {
      requireBot: jest.fn().mockResolvedValue({
        id: 'bot-1',
        workspaceId: 'workspace-1',
      }),
    };
    const service = new GreeterSequenceAdminService(
      prisma as never,
      admin as never,
    );

    await expect(
      service.publish('admin-1', 'bot-1', 'sequence-1', 3),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.greeterSequenceVersion.create).not.toHaveBeenCalled();
  });

  it('reuses a snapshot for the same draft revision on duplicate publish', async () => {
    const sequence = {
      id: 'sequence-1',
      workspaceId: 'workspace-1',
      botIntegrationId: 'bot-1',
      channelId: null,
      trigger: 'AFTER_START',
      draftRevision: 3,
      currentPublishedVersionId: 'version-1',
    };
    const version = {
      id: 'version-1',
      sequenceId: sequence.id,
      version: 1,
      status: 'PUBLISHED',
      sourceDraftRevision: 3,
      createdAt: new Date('2026-08-09T10:00:00.000Z'),
    };
    const tx = {
      greeterSequence: {
        findUnique: jest.fn().mockResolvedValue({
          ...sequence,
          draftSteps: [{ id: 'draft-step' }],
          versions: [version],
        }),
        updateMany: jest.fn(),
      },
      greeterSequenceVersion: {
        findFirst: jest.fn().mockResolvedValue(version),
        create: jest.fn(),
      },
      greeterSequenceStep: { createMany: jest.fn() },
    };
    const prisma = {
      greeterSequence: { findFirst: jest.fn().mockResolvedValue(sequence) },
      greeterSequenceVersion: {
        findFirst: jest.fn().mockResolvedValue({ ...version, steps: [] }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const admin = {
      requireBot: jest.fn().mockResolvedValue({
        id: 'bot-1',
        workspaceId: 'workspace-1',
      }),
    };
    const service = new GreeterSequenceAdminService(
      prisma as never,
      admin as never,
    );

    await expect(
      service.publish('admin-1', 'bot-1', 'sequence-1', 3),
    ).resolves.toMatchObject({ version: { id: 'version-1' } });
    expect(tx.greeterSequenceVersion.create).not.toHaveBeenCalled();
    expect(tx.greeterSequenceStep.createMany).not.toHaveBeenCalled();
  });
});
