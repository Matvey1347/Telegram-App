import { TelegramUnifiedImportService, unifiedImportHash } from './telegram-unified-import.service';

describe('TelegramUnifiedImportService', () => {
  const prisma = {
    telegramChannel: { findFirst: jest.fn().mockResolvedValue({ id: 'channel-1' }) },
    postGroup: { findMany: jest.fn().mockResolvedValue([]) },
    telegramManagedPost: { findMany: jest.fn().mockResolvedValue([]) },
    telegramContentHypothesis: { findMany: jest.fn().mockResolvedValue([]) },
    telegramPublicationScheduleSlot: { findMany: jest.fn().mockResolvedValue([{ id: 'slot-1', scheduleId: 'schedule-1' }]) },
    telegramChannelPublicationScheduleAssignment: { findFirst: jest.fn().mockResolvedValue({ scheduleId: 'schedule-1', selectionMode: 'FULL', selectedSlots: [] }) },
  };
  const workspaces = { resolveWorkspaceMembershipForUser: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }) };
  const service = new TelegramUnifiedImportService(
    prisma as never,
    workspaces as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  it('previews each section independently without writing', async () => {
    const preview = await service.preview('user-1', 'channel-1', {
      version: 1,
      groups: [{ ref: 'group', action: 'CREATE', title: 'Editorial' }],
      hypotheses: [],
      posts: [{ ref: 'post', action: 'CREATE', title: 'Launch', groupRef: 'group' }],
      schedule: [{ postRef: 'post', slotId: 'slot-1', scheduledAt: '2026-10-01T08:00:00.000Z' }],
    });
    expect(preview.valid).toBe(true);
    expect(preview.sections.map((section) => section.key)).toEqual(['groups', 'hypotheses', 'posts', 'schedule']);
  });

  it('rejects cross-section references that do not exist', async () => {
    const preview = await service.preview('user-1', 'channel-1', {
      version: 1,
      posts: [{ ref: 'post', action: 'CREATE', title: 'Launch', groupRef: 'missing' }],
    });
    expect(preview.valid).toBe(false);
    expect(preview.sections[2].items[0].errors).toContain('Unknown groupRef');
  });

  it('produces a stable idempotency hash', () => {
    const manifest = { version: 1 as const, posts: [] };
    expect(unifiedImportHash(manifest)).toBe(unifiedImportHash(manifest));
  });
});
