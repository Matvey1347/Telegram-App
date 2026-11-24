import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SupportTicketsService } from './support-tickets.service';

function setup() {
  const ticket = {
    id: 'ticket-id',
    chatId: '12',
    botId: '123',
    product: 'GROSHLY',
    updatedAt: new Date(),
  };
  const tx = {
    $executeRaw: jest.fn(),
    telegramSupportTicket: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(ticket),
      update: jest.fn().mockResolvedValue(ticket),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    telegramSupportMessage: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'message-id', status: 'SENDING' }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
    },
  };
  const db = {
    ...tx,
    $transaction: jest.fn((callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };
  const bots = {
    authenticate: jest
      .fn()
      .mockReturnValue({ workspaceId: 'tenant', botId: '123' }),
    metadata: jest
      .fn()
      .mockReturnValue({ workspaceId: 'tenant', botId: '123' }),
    resolve: jest
      .fn()
      .mockReturnValue({
        workspaceId: 'tenant',
        token: 'configured-token',
        botId: '123',
      }),
  };
  const telegram = {
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
  };
  return {
    db,
    tx,
    bots,
    telegram,
    ticket,
    service: new SupportTicketsService(
      db as never,
      bots as never,
      telegram as never,
    ),
  };
}

const update = {
  update_id: 300,
  message: {
    chat: { id: 12, type: 'private' },
    from: { id: 12, first_name: 'Customer' },
    text: 'I cannot open the app',
  },
};

describe('Telegram support tickets', () => {
  it('creates a ticket attributed to the receiving support bot and emits a scoped event', async () => {
    const { tx, service } = setup();
    const event = jest.fn();
    const other = jest.fn();
    const ownSubscription = service.events('tenant').subscribe(event);
    const otherSubscription = service.events('other-tenant').subscribe(other);
    await expect(
      service.receive('GROSHLY', 'signature', update),
    ).resolves.toEqual({ ok: true });
    expect(tx.telegramSupportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          product: 'GROSHLY',
          needsReply: true,
          workspaceId: 'tenant',
        }),
      }),
    );
    expect(event).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    ownSubscription.unsubscribe();
    otherSubscription.unsubscribe();
  });

  it('discards duplicate deliveries before creating or updating a ticket', async () => {
    const { tx, service } = setup();
    tx.telegramSupportMessage.findUnique.mockResolvedValue({ id: 'existing' });
    await service.receive('GROSHLY', 'signature', update);
    expect(tx.telegramSupportTicket.create).not.toHaveBeenCalled();
    expect(tx.telegramSupportTicket.update).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated webhooks and ignores group messages', async () => {
    const { db, bots, service } = setup();
    await service.receive('GROSHLY', 'signature', {
      ...update,
      message: { ...update.message, chat: { id: 12, type: 'group' } },
    });
    bots.authenticate.mockImplementation(() => {
      throw new UnauthorizedException();
    });
    await expect(
      service.receive('GROSHLY', 'bad', update),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('scopes ticket access and does not send a reply for a missing ticket', async () => {
    const { service, telegram } = setup();
    await expect(
      service.reply('other-tenant', 'ticket-id', 'reply-id', 'Hello'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('does not send an old ticket through a replacement bot', async () => {
    const { tx, service, ticket, telegram, bots } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    bots.resolve.mockReturnValue({ workspaceId: 'tenant', botId: '456' });
    await expect(
      service.reply('tenant', ticket.id, 'reply-id', 'Hello'),
    ).rejects.toThrow('original support bot');
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('records an uncertain remote result without marking the ticket answered', async () => {
    const { tx, service, ticket, telegram } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    telegram.sendMessage.mockRejectedValue(new Error('Timed out'));
    await expect(
      service.reply('tenant', ticket.id, 'reply-id', 'I can help'),
    ).resolves.toMatchObject({ status: 'UNKNOWN' });
    expect(tx.telegramSupportTicket.updateMany).not.toHaveBeenCalled();
  });
});
