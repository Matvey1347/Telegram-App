import {
  TelegramUnifiedImportService,
  unifiedImportHash,
} from './telegram-unified-import.service';

describe('TelegramUnifiedImportService', () => {
  const prisma = {
    telegramChannel: {
      findFirst: jest.fn().mockResolvedValue({ id: 'channel-1' }),
    },
    postGroup: { findMany: jest.fn().mockResolvedValue([]) },
    telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
    telegramContentHypothesis: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    icon: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    telegramPublicationScheduleSlot: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'slot-1', scheduleId: 'schedule-1' }]),
    },
    telegramChannelPublicationScheduleAssignment: {
      findFirst: jest.fn().mockResolvedValue({
        scheduleId: 'schedule-1',
        selectionMode: 'FULL',
        selectedSlots: [],
      }),
    },
  };
  const workspaces = {
    resolveWorkspaceMembershipForUser: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'workspace-1' }),
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue('workspace-1'),
  };
  const hypotheses = {
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    setPostHypotheses: jest.fn(),
  };
  const groups = {
    createPostGroup: jest.fn(),
    updatePostGroup: jest.fn(),
    deletePostGroup: jest.fn(),
  };
  const commands = { createManagedPost: jest.fn() };
  const history = { updateManagedPost: jest.fn() };
  const moves = { deleteManagedPost: jest.fn() };
  const publication = {
    scheduleManagedPost: jest.fn(),
    returnManagedPostToDraft: jest.fn(),
  };
  const service = new TelegramUnifiedImportService(
    prisma as never,
    workspaces as never,
    groups as never,
    commands as never,
    history as never,
    moves as never,
    publication as never,
    hypotheses as never,
  );

  beforeEach(() => {
    prisma.postGroup.findMany.mockReset().mockResolvedValue([]);
    prisma.telegramManagedPost.findMany.mockReset().mockResolvedValue([]);
    prisma.telegramContentHypothesis.findMany.mockReset().mockResolvedValue([]);
    prisma.icon.findFirst.mockReset();
    prisma.icon.create.mockReset();
    hypotheses.create.mockReset();
    hypotheses.update.mockReset();
    hypotheses.remove.mockReset();
    hypotheses.setPostHypotheses.mockReset();
    groups.createPostGroup.mockReset();
    groups.updatePostGroup.mockReset();
    groups.deletePostGroup.mockReset();
    commands.createManagedPost.mockReset();
    history.updateManagedPost.mockReset();
    moves.deleteManagedPost.mockReset();
    publication.scheduleManagedPost.mockReset();
    publication.returnManagedPostToDraft.mockReset();
  });

  it('previews each section independently without writing', async () => {
    const preview = await service.preview('user-1', 'channel-1', {
      version: 1,
      groups: [{ ref: 'group', action: 'CREATE', title: 'Editorial' }],
      hypotheses: [],
      posts: [
        { ref: 'post', action: 'CREATE', title: 'Launch', groupRef: 'group' },
      ],
      schedule: [
        {
          postRef: 'post',
          slotId: 'slot-1',
          scheduledAt: '2026-10-01T08:00:00.000Z',
        },
      ],
    });
    expect(preview.valid).toBe(true);
    expect(preview.sections.map((section) => section.key)).toEqual([
      'groups',
      'hypotheses',
      'posts',
      'schedule',
    ]);
  });

  it('rejects cross-section references that do not exist', async () => {
    const preview = await service.preview('user-1', 'channel-1', {
      version: 1,
      posts: [
        { ref: 'post', action: 'CREATE', title: 'Launch', groupRef: 'missing' },
      ],
    });
    expect(preview.valid).toBe(false);
    expect(preview.sections[2].items[0].errors).toContain('Unknown groupRef');
  });

  it('produces a stable idempotency hash', () => {
    const manifest = { version: 1 as const, posts: [] };
    expect(unifiedImportHash(manifest)).toBe(unifiedImportHash(manifest));
  });

  it('resolves a plain hypothesis emoji to an internal icon id', async () => {
    prisma.icon.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'icon-brain' });
    hypotheses.create.mockResolvedValue({ id: 'hypothesis-1' });
    const manifest = {
      version: 1 as const,
      hypotheses: [
        {
          ref: 'hyp-growth',
          action: 'CREATE' as const,
          icon: '🧠',
          value: { name: 'Growth test', status: 'ACTIVE' as const },
        },
      ],
    };

    const result = await service.apply(
      'user-1',
      'channel-1',
      manifest,
      unifiedImportHash(manifest),
    );

    expect(hypotheses.create).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      expect.objectContaining({ name: 'Growth test', iconId: 'icon-brain' }),
    );
    expect(result.sections[1].created).toBe(1);
  });

  it('creates referenced groups and hypotheses before their publications', async () => {
    groups.createPostGroup.mockResolvedValue({ id: 'group-created' });
    hypotheses.create.mockResolvedValue({ id: 'hypothesis-created' });
    commands.createManagedPost.mockResolvedValue({ id: 'post-created' });
    const manifest = {
      version: 1 as const,
      groups: [{ ref: 'group-new', action: 'CREATE' as const, title: 'Group' }],
      hypotheses: [
        {
          ref: 'hypothesis-new',
          action: 'CREATE' as const,
          value: { name: 'Hypothesis', status: 'ACTIVE' as const },
        },
      ],
      posts: [
        {
          ref: 'post-new',
          action: 'CREATE' as const,
          title: 'Publication',
          groupRef: 'group-new',
          hypothesisRefs: ['hypothesis-new'],
        },
      ],
    };

    await service.apply(
      'user-1',
      'channel-1',
      manifest,
      unifiedImportHash(manifest),
    );

    expect(groups.createPostGroup.mock.invocationCallOrder[0]).toBeLessThan(
      hypotheses.create.mock.invocationCallOrder[0],
    );
    expect(hypotheses.create.mock.invocationCallOrder[0]).toBeLessThan(
      commands.createManagedPost.mock.invocationCallOrder[0],
    );
    expect(commands.createManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      expect.objectContaining({ title: 'Publication' }),
      { groupId: 'group-created' },
    );
    expect(hypotheses.setPostHypotheses).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'post-created',
      { hypothesisIds: ['hypothesis-created'] },
    );
  });

  it('deletes a hypothesis by an exact existing id', async () => {
    prisma.telegramContentHypothesis.findMany.mockResolvedValueOnce([
      { id: 'hypothesis-existing' },
    ]);
    hypotheses.remove.mockResolvedValue({ success: true });
    const manifest = {
      version: 1 as const,
      hypotheses: [
        {
          ref: 'delete-hypothesis',
          action: 'DELETE' as const,
          id: 'hypothesis-existing',
        },
      ],
    };

    const result = await service.apply(
      'user-1',
      'channel-1',
      manifest,
      unifiedImportHash(manifest),
    );

    expect(hypotheses.remove).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'hypothesis-existing',
    );
    expect(result.sections[1].deleted).toBe(1);
  });

  it('passes a plain publication emoji through as icon', async () => {
    commands.createManagedPost.mockResolvedValue({ id: 'post-created' });
    const manifest = {
      version: 1 as const,
      posts: [
        {
          ref: 'post-new',
          action: 'CREATE' as const,
          title: 'New publication',
          icon: '✍️',
        },
      ],
    };

    await service.apply(
      'user-1',
      'channel-1',
      manifest,
      unifiedImportHash(manifest),
    );

    expect(commands.createManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      expect.objectContaining({ title: 'New publication', icon: '✍️' }),
      { groupId: null },
    );
  });

  it('previews imported publications separately and does not import them again', async () => {
    const manifest = {
      version: 1 as const,
      posts: [
        {
          ref: 'post-imported',
          action: 'CREATE' as const,
          title: 'Already imported',
          imported: true,
          approved: true,
        },
      ],
    };

    const preview = await service.preview('user-1', 'channel-1', manifest);
    const result = await service.apply(
      'user-1',
      'channel-1',
      manifest,
      unifiedImportHash(manifest),
    );

    expect(preview.sections[2].items[0]).toEqual(
      expect.objectContaining({ imported: true, approved: true, valid: true }),
    );
    expect(commands.createManagedPost).not.toHaveBeenCalled();
    expect(result.sections[2].created).toBe(0);
  });

  it('previews and unschedules an existing scheduled publication through the audited draft flow', async () => {
    const existing = {
      id: 'post-scheduled',
      title: 'Scheduled publication',
      text: 'Scheduled Telegram body',
      imageUrls: [],
      icon: '🗓️',
      status: 'SCHEDULED',
      scheduledAt: new Date('2026-10-01T08:00:00.000Z'),
    };
    prisma.telegramManagedPost.findMany
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([existing]);
    publication.returnManagedPostToDraft.mockResolvedValue({
      ...existing,
      status: 'DRAFT',
      scheduledAt: null,
    });
    const manifest = {
      version: 1 as const,
      schedule: [
        {
          action: 'UNSCHEDULE' as const,
          postId: 'post-scheduled',
        },
      ],
    };

    const preview = await service.preview('user-1', 'channel-1', manifest);
    const result = await service.apply(
      'user-1',
      'channel-1',
      manifest,
      unifiedImportHash(manifest),
    );

    expect(preview.sections[3].items[0]).toEqual(
      expect.objectContaining({
        action: 'UNSCHEDULE',
        entityId: 'post-scheduled',
        label: 'Scheduled publication',
        scheduledAt: '2026-10-01T08:00:00.000Z',
        valid: true,
      }),
    );
    expect(publication.returnManagedPostToDraft).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'post-scheduled',
    );
    expect(result.sections[3]).toEqual(
      expect.objectContaining({ scheduled: 0, unscheduled: 1 }),
    );
  });

  it('rejects unscheduling a publication that is not currently scheduled', async () => {
    prisma.telegramManagedPost.findMany.mockResolvedValueOnce([
      {
        id: 'post-draft',
        title: 'Draft publication',
        text: 'Draft body',
        imageUrls: [],
        icon: '✍️',
        status: 'DRAFT',
        scheduledAt: null,
      },
    ]);

    const preview = await service.preview('user-1', 'channel-1', {
      version: 1,
      schedule: [{ action: 'UNSCHEDULE', postId: 'post-draft' }],
    });

    expect(preview.valid).toBe(false);
    expect(preview.sections[3].items[0].errors).toContain(
      'Only a scheduled post can be unscheduled',
    );
  });

  it('reschedules an existing publication by its exact id', async () => {
    const existing = {
      id: 'post-scheduled',
      title: 'Scheduled publication',
      text: 'Scheduled body',
      imageUrls: [],
      icon: '🗓️',
      status: 'SCHEDULED',
      scheduledAt: new Date('2026-10-01T08:00:00.000Z'),
    };
    prisma.telegramManagedPost.findMany
      .mockResolvedValueOnce([existing])
      .mockResolvedValueOnce([existing]);
    const manifest = {
      version: 1 as const,
      schedule: [
        {
          action: 'SCHEDULE' as const,
          postId: 'post-scheduled',
          slotId: 'slot-1',
          scheduledAt: '2026-10-02T08:00:00.000Z',
        },
      ],
    };

    const preview = await service.preview('user-1', 'channel-1', manifest);
    const result = await service.apply(
      'user-1',
      'channel-1',
      manifest,
      unifiedImportHash(manifest),
    );

    expect(preview.sections[3].items[0]).toEqual(
      expect.objectContaining({
        action: 'SCHEDULE',
        entityId: 'post-scheduled',
        label: 'Scheduled publication',
        valid: true,
      }),
    );
    expect(publication.scheduleManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'post-scheduled',
      {
        scheduledAt: '2026-10-02T08:00:00.000Z',
        publicationSlotId: 'slot-1',
      },
    );
    expect(result.sections[3]).toEqual(
      expect.objectContaining({ scheduled: 1, unscheduled: 0 }),
    );
  });

  it('applies root delete targets after the main manifest operations', async () => {
    prisma.postGroup.findMany
      .mockResolvedValueOnce([
        { id: 'group-existing', title: 'Editorial', icon: '🗂️' },
      ])
      .mockResolvedValueOnce([
        { id: 'group-existing', title: 'Editorial', icon: '🗂️' },
      ]);
    prisma.telegramContentHypothesis.findMany
      .mockResolvedValueOnce([
        {
          id: 'hypothesis-existing',
          name: 'Growth idea',
          description: 'Test description',
          status: 'ACTIVE',
          icon: { emoji: '🧠' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'hypothesis-existing',
          name: 'Growth idea',
          description: 'Test description',
          status: 'ACTIVE',
          icon: { emoji: '🧠' },
        },
      ]);
    prisma.telegramManagedPost.findMany
      .mockResolvedValueOnce([
        {
          id: 'post-existing',
          title: 'Existing publication',
          text: 'Telegram body',
          imageUrls: ['https://example.com/image.jpg'],
          icon: '📝',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'post-existing',
          title: 'Existing publication',
          text: 'Telegram body',
          imageUrls: ['https://example.com/image.jpg'],
          icon: '📝',
        },
      ]);
    const manifest = {
      version: 1 as const,
      delete: {
        groups: [{ id: 'group-existing' }],
        hypotheses: [{ id: 'hypothesis-existing' }],
        posts: [{ id: 'post-existing' }],
      },
    };

    const preview = await service.preview('user-1', 'channel-1', manifest);
    const result = await service.apply(
      'user-1',
      'channel-1',
      manifest,
      unifiedImportHash(manifest),
    );

    expect(preview.sections[0].items[0]).toEqual(
      expect.objectContaining({
        label: 'Editorial',
        icon: '🗂️',
        entityId: 'group-existing',
      }),
    );
    expect(preview.sections[1].items[0]).toEqual(
      expect.objectContaining({
        label: 'Growth idea',
        icon: '🧠',
        description: 'Test description',
      }),
    );
    expect(preview.sections[2].items[0]).toEqual(
      expect.objectContaining({
        label: 'Existing publication',
        text: 'Telegram body',
        imageUrls: ['https://example.com/image.jpg'],
      }),
    );

    expect(moves.deleteManagedPost).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'post-existing',
    );
    expect(hypotheses.remove).toHaveBeenCalledWith(
      'user-1',
      'channel-1',
      'hypothesis-existing',
    );
    expect(groups.deletePostGroup).toHaveBeenCalledWith(
      'user-1',
      'group-existing',
    );
    expect(result.sections.map((section) => section.deleted)).toEqual([
      1, 1, 1, 0,
    ]);
  });

  it('rejects an entity that is both updated and root-deleted', async () => {
    prisma.postGroup.findMany.mockResolvedValueOnce([{ id: 'group-existing' }]);

    const preview = await service.preview('user-1', 'channel-1', {
      version: 1,
      groups: [
        {
          ref: 'group-update',
          action: 'UPDATE',
          id: 'group-existing',
          title: 'Updated',
        },
      ],
      delete: { groups: [{ id: 'group-existing' }] },
    });

    expect(preview.valid).toBe(false);
    expect(preview.sections[0].items[0].errors).toContain(
      'Group also appears in delete.groups',
    );
  });
});
