import { NotFoundException } from '@nestjs/common';
import { TelegramCrmConversationAttachService } from './telegram-crm-conversation-attach.service';

const resolvedPeer = {
  telegramUserId: '42',
  telegramAccessHash: 'hash-42',
  username: 'alice',
  firstName: 'Alice',
  lastName: null,
  photoUrl: null,
};

describe('TelegramCrmConversationAttachService', () => {
  const setup = (contact: { id: string } | null = { id: 'contact-target' }) => {
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([]),
      telegramAdvertiser: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            contact ? { ...contact, phone: '+380661234567' } : null,
          ),
      },
      telegramAdSale: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      telegramCrmPeer: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ contactId: 'contact-source' }),
      },
      telegramAdvertiserContact: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({ id: 'channel-1' }),
        create: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      },
    };
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
    };
    const accountAccess = { requireUsableSession: jest.fn() };
    const runtime = {
      withAccountHandle: jest.fn((_workspace, _account, _purpose, operation) =>
        operation({
          resolvePrivatePeerReference: jest
            .fn()
            .mockResolvedValue(resolvedPeer),
        }),
      ),
    };
    const peers = { upsert: jest.fn().mockResolvedValue({ id: 'peer-1' }) };
    const conversations = {
      create: jest.fn().mockResolvedValue({ id: 'conversation-1' }),
    };
    const merges = { merge: jest.fn().mockResolvedValue({}) };
    return {
      service: new TelegramCrmConversationAttachService(
        prisma as never,
        authorization as never,
        accountAccess as never,
        runtime as never,
        peers as never,
        conversations as never,
        merges as never,
      ),
      accountAccess,
      peers,
      conversations,
      merges,
      prisma,
    };
  };

  it('resolves a reference, merges a duplicate contact, and creates the fixed-account conversation', async () => {
    const context = setup();

    await expect(
      context.service.attach('user-1', 'contact-target', {
        accountId: 'account-1',
        reference: '@alice',
      }),
    ).resolves.toEqual({ id: 'conversation-1' });

    expect(context.merges.merge).toHaveBeenCalledWith(
      'user-1',
      'contact-target',
      'contact-source',
    );
    expect(context.peers.upsert).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        telegramUserId: '42',
        contactId: 'contact-target',
      }),
    );
    expect(context.conversations.create).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        accountId: 'account-1',
        contactId: 'contact-target',
      }),
    );
    expect(context.prisma.telegramAdSale.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { advertiserId: 'contact-target' },
      }),
    );
    expect(context.prisma.telegramAdvertiserContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          advertiserId: 'contact-target',
          type: 'TELEGRAM_USERNAME',
          isPrimary: true,
        }),
      }),
    );
  });

  it('does not access Telegram when the target contact is outside the workspace', async () => {
    const context = setup(null);

    await expect(
      context.service.attach('user-1', 'missing', {
        accountId: 'account-1',
        reference: '@alice',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(context.accountAccess.requireUsableSession).not.toHaveBeenCalled();
  });
});
