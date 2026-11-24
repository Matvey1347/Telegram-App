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
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'message-id', status: 'SENDING' }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      .mockReturnValue({ workspaceId: 'tenant', botId: '123', token: 'configured-token' }),
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
    getUserProfilePhotos: jest.fn(),
    getFile: jest.fn(),
    getChat: jest.fn().mockResolvedValue({}),
    editMessageText: jest.fn().mockResolvedValue({ message_id: 17 }),
    deleteMessage: jest.fn().mockResolvedValue(true),
    downloadFile: jest.fn(),
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
  it.each(['sender', 'bot'] as const)('returns the %s photo from the ticket’s original bot', async (kind) => {
    const { service, tx, telegram, ticket } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    telegram.getUserProfilePhotos.mockResolvedValue({ photos: [[{ file_id: 'small' }, { file_id: 'large' }]] });
    telegram.getFile.mockResolvedValue({ file_path: 'photos/profile.jpg' });
    const bytes = Buffer.from([255, 216, 255]);
    telegram.downloadFile.mockResolvedValue({ bytes, contentType: 'image/jpeg' });

    await expect(service.avatar('tenant', ticket.id, kind)).resolves.toEqual({ bytes, contentType: 'image/jpeg' });
    expect(telegram.getUserProfilePhotos).toHaveBeenCalledWith('configured-token', kind === 'sender' ? ticket.chatId : ticket.botId);
    expect(telegram.getFile).toHaveBeenCalledWith('configured-token', 'small');
  });

  it('checks the ticket workspace and the original bot before requesting a profile', async () => {
    const { service, tx, telegram, ticket } = setup();
    await expect(service.avatar('another-workspace', ticket.id, 'sender')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.telegramSupportTicket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ workspaceId: 'another-workspace', id: ticket.id }),
    }));
    tx.telegramSupportTicket.findFirst.mockResolvedValue({ ...ticket, botId: 'previous-bot' });
    await expect(service.avatar('tenant', ticket.id, 'sender')).resolves.toBeNull();
    expect(telegram.getUserProfilePhotos).not.toHaveBeenCalled();
  });

  it('falls back when a Telegram profile has no accessible photo or download fails', async () => {
    const { service, tx, telegram, ticket } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    telegram.getUserProfilePhotos.mockResolvedValueOnce({ photos: [] });
    await expect(service.avatar('tenant', ticket.id, 'sender')).resolves.toBeNull();
    expect(telegram.getFile).not.toHaveBeenCalled();

    telegram.getUserProfilePhotos.mockResolvedValue({ photos: [[{ file_id: 'small' }]] });
    telegram.getFile.mockResolvedValue({ file_path: 'photos/profile.jpg' });
    telegram.downloadFile.mockRejectedValue(new Error('Upstream unavailable'));
    await expect(service.avatar('tenant', ticket.id, 'sender')).resolves.toBeNull();
  });

  it('serves Telegram JPEGs with a generic upstream MIME type and falls back to the chat photo', async () => {
    const { service, ticket, tx, telegram } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    telegram.getUserProfilePhotos.mockResolvedValue({ photos: [] });
    telegram.getChat.mockResolvedValue({ photo: { small_file_id: 'chat-photo' } });
    telegram.getFile.mockResolvedValue({ file_path: 'photos/profile.jpg' });
    const bytes = Buffer.from([255, 216, 255, 0]);
    telegram.downloadFile.mockResolvedValue({ bytes, contentType: 'application/octet-stream' });
    await expect(service.avatar('tenant', ticket.id, 'sender')).resolves.toEqual({ bytes, contentType: 'image/jpeg' });
    expect(telegram.getFile).toHaveBeenCalledWith('configured-token', 'chat-photo');
  });

  it('stores the incoming Telegram message ID and sends a native reply to that message', async () => {
    const { service, tx, ticket, telegram } = setup();
    await service.receive('GROSHLY', 'signature', { ...update, message: { ...update.message, message_id: 17 } });
    expect(tx.telegramSupportMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ telegramMessageId: 17, status: 'INBOUND' }),
    }));
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    tx.telegramSupportMessage.findFirst.mockResolvedValue({ telegramMessageId: 17 });
    tx.telegramSupportMessage.create.mockResolvedValue({ id: 'outgoing', replyToTelegramId: 17 });
    await expect(service.reply('tenant', ticket.id, 'client-reply', 'Thanks', true, 'incoming'))
      .resolves.toMatchObject({ status: 'SENT', telegramMessageId: 1 });
    expect(telegram.sendMessage).toHaveBeenCalledWith('configured-token', expect.objectContaining({
      chat_id: ticket.chatId, reply_parameters: { message_id: 17 },
    }));
    expect(tx.telegramSupportMessage.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'incoming', workspaceId: 'tenant', ticket: expect.objectContaining({ botId: ticket.botId, chatId: ticket.chatId }) }),
    }));
  });

  it('records Telegram edits and only marks messages deleted after confirmation', async () => {
    const { service, ticket, tx, telegram } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    tx.telegramSupportMessage.findFirst.mockResolvedValue({
      id: 'sent', createdAt: new Date(), telegramMessageId: 17, text: 'Old', status: 'SENT',
    });
    await expect(service.changeMessage('tenant', ticket.id, 'sent', 'New'))
      .resolves.toMatchObject({ text: 'New', editedAt: expect.any(Date) });
    expect(telegram.editMessageText).toHaveBeenCalledWith('configured-token', expect.objectContaining({ message_id: 17, text: 'New' }));
    telegram.deleteMessage.mockRejectedValueOnce(new Error('Timed out'));
    await expect(service.changeMessage('tenant', ticket.id, 'sent')).rejects.toThrow('Telegram did not confirm');
    expect(tx.telegramSupportMessage.update).toHaveBeenCalledTimes(1);
    await expect(service.changeMessage('tenant', ticket.id, 'sent')).resolves.toMatchObject({ deletedAt: expect.any(Date), text: '' });
  });

  it('applies and removes reactions by Telegram ID inside the matching private conversation', async () => {
    const { service, tx, ticket } = setup();
    const reaction = { chat: { id: Number(ticket.chatId), type: 'private' }, user: { id: Number(ticket.chatId) },
      date: 1_700_000_000, message_id: 17, new_reaction: [{ type: 'emoji', emoji: '👍' }] };
    await service.receive('GROSHLY', 'signature', { update_id: 42, message_reaction: reaction });
    expect(tx.telegramSupportMessage.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        telegramMessageId: 17,
        ticket: { workspaceId: 'tenant', botId: ticket.botId, chatId: ticket.chatId, product: 'GROSHLY' },
        OR: expect.arrayContaining([{ reactionDate: reaction.date, reactionUpdateId: { lt: 42n } }]),
      }),
      data: expect.objectContaining({ reactions: ['👍'] }),
    }));
    await service.receive('GROSHLY', 'signature', { update_id: 43, message_reaction: { ...reaction, new_reaction: [] } });
    expect(tx.telegramSupportMessage.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reactions: [] }),
    }));
    expect(tx.telegramSupportTicket.create).not.toHaveBeenCalled();
  });

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

  it('reopens the last closed ticket on incoming messages without losing the thread', async () => {
    const { service, tx, ticket } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(ticket);
    const date = Math.floor(Date.now() / 1000) - 60;
    await service.receive('GROSHLY', 'signature', { ...update, message: { ...update.message, date } });
    expect(tx.telegramSupportTicket.create).not.toHaveBeenCalled();
    expect(tx.telegramSupportTicket.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: ticket.id }, data: expect.objectContaining({ closedAt: null, needsReply: true }),
    }));
    expect(tx.telegramSupportMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ticketId: ticket.id, text: update.message.text, createdAt: new Date(date * 1000) }),
    }));
  });

  it('reopens a closed ticket manually, reusing the active ticket if it exists', async () => {
    const { service, tx, ticket } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValueOnce(ticket).mockResolvedValueOnce(null);
    await expect(service.reopen('tenant', ticket.id)).resolves.toEqual({ id: ticket.id });
    expect(tx.telegramSupportTicket.updateMany).toHaveBeenCalledTimes(1);
    tx.telegramSupportTicket.findFirst.mockResolvedValueOnce(ticket).mockResolvedValueOnce({ id: 'current' });
    await expect(service.reopen('tenant', ticket.id)).resolves.toEqual({ id: 'current' });
    expect(tx.telegramSupportTicket.updateMany).toHaveBeenCalledTimes(1);
  });

  it('reads the bot conversation across tickets within the same workspace', async () => {
    const { service, tx, ticket } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    const createdAt = new Date();
    tx.telegramSupportMessage.findFirst.mockResolvedValue({ createdAt });
    tx.telegramSupportMessage.findMany.mockResolvedValue([{ id: 'legacy-auto:old-ticket', automatic: true }]);
    await expect(service.thread('tenant', ticket.id)).resolves.toMatchObject({
      items: [{ legacy: true }], lastInboundAt: createdAt,
    });
    expect(tx.telegramSupportMessage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId: 'tenant', ticket: { workspaceId: 'tenant', product: 'GROSHLY', botId: '123', chatId: '12' } },
    }));
  });

  it('records a new /start without sending another greeting to the same conversation', async () => {
    const { service, tx, ticket, telegram } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    tx.telegramSupportMessage.findFirst.mockResolvedValue({ id: 'prior-greeting' });
    await service.receive('GROSHLY', 'signature', { ...update, message: { ...update.message, text: '/start' } });
    expect(tx.telegramSupportMessage.create).toHaveBeenCalledTimes(1);
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('discards duplicate deliveries before creating or updating a ticket', async () => {
    const { tx, service } = setup();
    tx.telegramSupportMessage.findUnique.mockResolvedValue({ id: 'existing' });
    await service.receive('GROSHLY', 'signature', update);
    expect(tx.telegramSupportTicket.create).not.toHaveBeenCalled();
    expect(tx.telegramSupportTicket.update).not.toHaveBeenCalled();
  });

  it.each([
    ['NEXELOQ', 'Nexeloq'],
    ['GROSHLY', 'Groshly'],
  ] as const)('opens a %s ticket and records the Ukrainian automatic reply', async (product, name) => {
    const { db, tx, service, telegram } = setup();
    const start = {
      ...update,
      message: { ...update.message, text: '/start support' },
    };
    await expect(service.receive(product, 'signature', start)).resolves.toEqual({ ok: true });
    const greeting = expect.stringContaining(`Дякуємо, що звернулися до служби підтримки ${name}!`);
    expect(tx.telegramSupportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ product, needsReply: true, workspaceId: 'tenant' }),
      }),
    );
    expect(tx.telegramSupportMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ text: start.message.text, status: 'INBOUND' }),
      }),
    );
    expect(tx.telegramSupportMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ text: greeting, automatic: true, status: 'SENDING' }),
      }),
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith('configured-token', expect.objectContaining({
      chat_id: String(update.message.chat.id), text: greeting,
    }));
    expect(db.telegramSupportMessage.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SENT', telegramMessageId: 1 } }));
    expect(tx.telegramSupportTicket.updateMany).not.toHaveBeenCalled();

    tx.telegramSupportMessage.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(service.receive(product, 'signature', start)).resolves.toEqual({ ok: true });
    expect(tx.telegramSupportTicket.create).toHaveBeenCalledTimes(1);
    expect(tx.telegramSupportMessage.create).toHaveBeenCalledTimes(2);
    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps the automatic reply visible with unconfirmed delivery after a timeout', async () => {
    const { tx, service, telegram } = setup();
    telegram.sendMessage.mockRejectedValue(new Error('Timed out'));
    await expect(service.receive('NEXELOQ', 'signature', {
      ...update, message: { ...update.message, text: '/start' },
    })).resolves.toEqual({ ok: true });
    expect(tx.telegramSupportMessage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'UNKNOWN' },
    }));
    expect(tx.telegramSupportTicket.updateMany).not.toHaveBeenCalled();
  });

  it('sends CRM editor formatting through the original support bot', async () => {
    const { tx, service, ticket, telegram } = setup();
    tx.telegramSupportTicket.findFirst.mockResolvedValue(ticket);
    const markup = '**Вітаю!** [Довідка](https://example.test) <plain>';
    await expect(service.reply('tenant', ticket.id, 'reply-id', markup, true)).resolves.toMatchObject({ status: 'SENT' });
    expect(telegram.sendMessage).toHaveBeenCalledWith('configured-token', expect.objectContaining({
      parse_mode: 'HTML',
      text: '<b>Вітаю!</b> <a href="https://example.test/">Довідка</a> &lt;plain&gt;',
    }));
    expect(tx.telegramSupportMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ text: markup, formatted: true }),
    }));
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
