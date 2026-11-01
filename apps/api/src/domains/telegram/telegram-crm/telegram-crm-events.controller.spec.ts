import { TelegramCrmStreamAccessService } from './telegram-crm-stream-access.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { TelegramCrmEventsController } from './telegram-crm-events.controller';

const event = (
  workspaceId: string,
  type: 'contact.updated' | 'inbox.updated',
  ownerMemberId: string | null,
) =>
  type === 'contact.updated'
    ? ({
        type,
        workspaceId,
        occurredAt: '2026-08-31T10:00:00.000Z',
        contactId: ownerMemberId === 'member-2' ? 'other-contact' : 'contact-1',
        ownerMemberId,
      } as const)
    : ({
        type,
        workspaceId,
        occurredAt: '2026-08-31T10:00:00.000Z',
        peerId: 'peer-1',
        contactId: null,
        ownerMemberId: null,
        conversation: null,
      } as const);

describe('TelegramCrmEventsController', () => {
  it('filters SSE by workspace and owner, and hides unassigned Inbox from viewOwn', async () => {
    const hub = new TelegramCrmEventHub();
    const controller = new TelegramCrmEventsController(
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
      } as never,
      hub,
      new TelegramCrmStreamAccessService(
        {
          telegramAdvertiser: {
            findMany: jest.fn().mockResolvedValue([
              { id: 'contact-1', ownerMemberId: 'member-1' },
              { id: 'other-contact', ownerMemberId: 'member-2' },
            ]),
          },
        } as never,
        {
          refresh: jest.fn(),
          require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
          scope: jest.fn().mockResolvedValue({ assignedMemberId: 'member-1' }),
        } as never,
      ),
    );
    const received: unknown[] = [];
    const stream = await controller.stream({ sub: 'user-1' } as never);
    const subscription = stream.subscribe((value) => received.push(value));

    hub.emit(event('workspace-2', 'contact.updated', 'member-1'));
    hub.emit(event('workspace-1', 'contact.updated', 'member-2'));
    hub.emit(event('workspace-1', 'inbox.updated', null));
    hub.emit(event('workspace-1', 'contact.updated', 'member-1'));

    const visibleEvent = event('workspace-1', 'contact.updated', 'member-1');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(received).toEqual([{ type: 'contact.updated', data: visibleEvent }]);
    subscription.unsubscribe();
  });

  it('allows all workspace events for viewAny scope', async () => {
    const hub = new TelegramCrmEventHub();
    const controller = new TelegramCrmEventsController(
      {
        require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
        scope: jest.fn().mockResolvedValue({}),
      } as never,
      hub,
      {
        visible: jest.fn(
          (_user: string, _workspace: string, events: unknown[]) =>
            Promise.resolve(events),
        ),
      } as never,
    );
    const received: unknown[] = [];
    const stream = await controller.stream({ sub: 'user-1' } as never);
    const subscription = stream.subscribe((value) => received.push(value));
    hub.emit(event('workspace-1', 'inbox.updated', null));

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(received).toHaveLength(1);
    subscription.unsubscribe();
  });
});
