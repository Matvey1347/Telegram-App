import { TelegramCrmStreamAccessService } from './telegram-crm-stream-access.service';
import type { CrmRealtimeEvent } from '@telegram-system/shared';
const event: CrmRealtimeEvent = {
  type: 'message.sent',
  workspaceId: 'ws',
  occurredAt: new Date().toISOString(),
  conversationId: 'conv',
  contactId: 'contact',
  ownerMemberId: 'old-owner',
  message: {} as never,
};
function setup() {
  const auth = {
    refresh: jest.fn().mockResolvedValue({}),
    require: jest.fn().mockResolvedValue({ workspaceId: 'ws' }),
    scope: jest.fn().mockResolvedValue({ assignedMemberId: 'old-owner' }),
  };
  const prisma = {
    telegramCrmConversation: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { id: 'conv', contact: { ownerMemberId: 'new-owner' } },
        ]),
    },
    telegramAdvertiser: { findMany: jest.fn() },
  };
  return {
    auth,
    prisma,
    service: new TelegramCrmStreamAccessService(prisma as never, auth as never),
  };
}
describe('fresh stream authorization', () => {
  it('delivers generic folder invalidation to scoped viewers without leaking across workspaces', async () => {
    const f = setup();
    const folders: CrmRealtimeEvent = {
      type: 'folders.updated',
      workspaceId: 'ws',
      ownerMemberId: null,
      occurredAt: new Date().toISOString(),
    };
    expect(
      await f.service.visible('user', 'ws', [
        folders,
        { ...folders, workspaceId: 'other' },
      ]),
    ).toEqual([folders]);
    expect(f.prisma.telegramCrmConversation.findMany).not.toHaveBeenCalled();
  });
  it('uses current conversation owner after reassignment, not owner copied into old event', async () => {
    const f = setup();
    expect(await f.service.visible('user', 'ws', [event])).toEqual([]);
    expect(f.auth.refresh).toHaveBeenCalledWith('user');
  });
  it('allows a currently authorized new owner without trusting stale event metadata', async () => {
    const f = setup();
    f.auth.scope.mockResolvedValue({ assignedMemberId: 'new-owner' });
    expect(await f.service.visible('user', 'ws', [event])).toEqual([event]);
  });
  it('rejects revoked workspace membership or fallback to a different workspace', async () => {
    const f = setup();
    f.auth.require.mockResolvedValue({ workspaceId: 'other' });
    await expect(f.service.visible('user', 'ws', [event])).rejects.toThrow(
      'CRM_STREAM_WORKSPACE_REVOKED',
    );
    expect(f.prisma.telegramCrmConversation.findMany).not.toHaveBeenCalled();
  });
  it('does not deliver an event for a resource removed after the event was queued', async () => {
    const f = setup();
    f.prisma.telegramCrmConversation.findMany.mockResolvedValue([]);
    expect(await f.service.visible('user', 'ws', [event])).toEqual([]);
  });
});
