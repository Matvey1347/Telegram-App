import { TelegramManagedPostDeliveryAlertsService } from './telegram-managed-post-delivery-alerts.service';
const post = { id: 'p', workspaceId: 'w', telegramChannelId: 'c' };
function setup() {
  const prisma = {
    operationsNotification: { findFirst: jest.fn().mockResolvedValue(null) },
    telegramManagedPost: {
      findFirst: jest.fn().mockResolvedValue({ assignedMemberId: 'assigned' }),
    },
    workspaceMember: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'owner' }, { id: 'denied' }]),
    },
  };
  const store = { insertMany: jest.fn().mockResolvedValue([{ id: 'n' }]) };
  const publisher = { publish: jest.fn() };
  const permissions = {
    canReceive: jest.fn().mockReturnValue(true),
    has: jest.fn((member) => member.id === 'owner'),
  };
  return {
    prisma,
    store,
    publisher,
    service: new TelegramManagedPostDeliveryAlertsService(
      prisma as never,
      store as never,
      publisher as never,
      permissions as never,
    ),
  };
}
describe('publication failure notifications', () => {
  it('targets authorized workspace recipients with an actionable post link', async () => {
    const t = setup();
    await t.service.notify(post, 'UNKNOWN');
    expect(t.store.insertMany.mock.calls[0][1]).toEqual([
      expect.objectContaining({
        workspaceId: 'w',
        recipientMemberId: 'owner',
        sourceKey: 'managed-post:p:delivery:UNKNOWN',
        priority: 'HIGH',
        targetUrl: '/telegram-posts/c/editor?postId=p',
      }),
    ]);
    expect(t.publisher.publish).toHaveBeenCalledWith(['n']);
  });
  it('does not write or resend an unchanged notification on each retry', async () => {
    const t = setup();
    t.prisma.operationsNotification.findFirst.mockResolvedValue({
      id: 'existing',
    });
    await t.service.notify(post, 'BLOCKED');
    expect(t.store.insertMany).not.toHaveBeenCalled();
    expect(t.publisher.publish).not.toHaveBeenCalled();
  });
});
