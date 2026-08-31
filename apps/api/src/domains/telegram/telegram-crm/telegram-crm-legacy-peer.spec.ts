import { syncLegacyCrmPeer } from './telegram-crm-legacy-peer';

describe('syncLegacyCrmPeer', () => {
  it('switches the singular legacy identity from A to B without rewriting Conversation contact links', async () => {
    const tx = {
      telegramCrmPeer: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'peer-b',
          contactId: null,
          username: 'buyer_b',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'peer-b',
          contactId: 'contact-1',
          username: 'buyer_b',
        }),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      telegramCrmConversation: { updateMany: jest.fn() },
    };

    await syncLegacyCrmPeer(tx as never, {
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      telegramUserId: '222',
      telegramUserIdSpecified: true,
      username: 'buyer_b',
      usernameSpecified: true,
    });

    expect(tx.telegramCrmPeer.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        contactId: 'contact-1',
        id: { not: 'peer-b' },
      },
      data: { contactId: null },
    });
    expect(tx.telegramCrmConversation.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.telegramCrmConversation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { contactId: 'contact-1' } }),
    );
  });

  it('updates only the deterministic representative peer on username-only changes', async () => {
    const tx = {
      telegramCrmPeer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'peer-representative',
          username: 'old_name',
        }),
        update: jest.fn(),
      },
    };

    await syncLegacyCrmPeer(tx as never, {
      workspaceId: 'workspace-1',
      contactId: 'contact-1',
      telegramUserId: undefined,
      telegramUserIdSpecified: false,
      username: '@new_name',
      usernameSpecified: true,
    });

    expect(tx.telegramCrmPeer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(tx.telegramCrmPeer.update).toHaveBeenCalledTimes(1);
    expect(tx.telegramCrmPeer.update).toHaveBeenCalledWith({
      where: { id: 'peer-representative' },
      data: { username: 'new_name' },
    });
  });
});
