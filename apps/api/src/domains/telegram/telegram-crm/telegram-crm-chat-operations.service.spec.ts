const containing = (value: Record<string, unknown>): unknown =>
  expect.objectContaining(value);
import { Prisma } from '@prisma/client';
import { TelegramCrmChatReceipts } from './telegram-crm-chat-receipts.service';
jest.mock('../../../config/deployment-config', () => ({
  crmChatRollout: jest.fn(() => ({ actions: true, media: true })),
}));
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TelegramCrmChatOperations } from './telegram-crm-chat-operations.service';
import { normalizeCrmOutgoingText } from '@api/telegram/shared/mtproto/telegram-crm-chat-text';
const operationId = () =>
  `${new Date().toISOString().slice(0, 10)}:b83fcfe3-139f-45ec-8d12-17b41a6f7ca1`;
const conversation = {
  id: 'conversation',
  workspaceId: 'workspace',
  mtprotoAccountId: 'account',
  contactId: null,
  telegramAccessHash: '123',
  peer: { telegramUserId: '42', username: null },
  contact: null,
  mtprotoAccount: { isActive: true, status: 'connected', crmSendEnabled: true },
};
const normalized = {
  telegramMessageId: 75,
  telegramUserId: '42',
  direction: 'OUTBOUND',
  text: 'hello',
  sentAt: new Date(),
  editedAt: null,
  contentMetadata: null,
};
function setup() {
  const message = {
    id: 'message',
    telegramMessageIdNumeric: 75,
    direction: 'OUTBOUND',
    deletedAt: null,
    contentMetadata: null,
  };
  const api = {
    getMessage: jest.fn().mockResolvedValue(normalized),
    editText: jest.fn().mockResolvedValue(normalized),
    deleteMessages: jest.fn().mockResolvedValue({ confirmed: true }),
    setReaction: jest.fn().mockResolvedValue(normalized),
    forwardMessage: jest.fn().mockResolvedValue(normalized),
  };
  const access = {
    conversation: jest.fn().mockResolvedValue({
      row: conversation,
      access: { workspaceId: 'workspace', memberId: 'member' },
    }),
    withHandle: jest.fn(
      (
        _u: string,
        _id: string,
        _m: boolean,
        _c: boolean,
        fn: (
          handle: { chatActions: typeof api },
          current: typeof conversation,
          peer: { telegramUserId: string; telegramAccessHash: string },
          memberId: string,
        ) => Promise<unknown>,
      ) =>
        fn(
          { chatActions: api },
          conversation,
          { telegramUserId: '42', telegramAccessHash: '123' },
          'member',
        ),
    ),
  };
  const receipt = {
    id: 'receipt',
    actorUserId: 'user',
    conversationId: 'conversation',
    operationId: operationId(),
    kind: 'EDIT',
    status: 'UNKNOWN',
    request: {
      operationId: operationId(),
      kind: 'EDIT',
      messageId: 'message',
      text: 'hello',
    },
  };
  const receipts = {
    claim: jest.fn().mockResolvedValue({ receipt, fresh: true }),
    response: jest.fn().mockResolvedValue({ status: 'UNKNOWN' }),
    finish: jest.fn().mockResolvedValue({}),
    find: jest.fn().mockResolvedValue(receipt),
  };
  const store = {
    confirmed: jest.fn().mockResolvedValue({ id: 'message', text: 'hello' }),
    deleted: jest.fn().mockResolvedValue(['message']),
  };
  const prisma = {
    telegramCrmMessage: { findFirst: jest.fn().mockResolvedValue(message) },
  };
  const service = new TelegramCrmChatOperations(
    prisma as never,
    access as never,
    receipts as never,
    store as never,
  );
  return { service, api, access, receipts, store, prisma, message, receipt };
}
describe('TelegramCrmChatOperations', () => {
  it('edits current own remote message and returns authoritative formatting result', async () => {
    const x = setup();
    const result = await x.service.execute('user', 'conversation', {
      operationId: operationId(),
      kind: 'EDIT',
      messageId: 'message',
      text: '[b]hello[/b]',
    });
    expect(result.status).toBe('CONFIRMED');
    expect(x.api.editText).toHaveBeenCalledWith({
      telegramUserId: '42',
      telegramAccessHash: '123',
      telegramMessageId: 75,
      text: '[b]hello[/b]',
    });
    expect(x.store.confirmed).toHaveBeenCalled();
  });
  it('rejects editing a foreign current message even if local direction says own', async () => {
    const x = setup();
    x.api.getMessage.mockResolvedValue({ ...normalized, direction: 'INBOUND' });
    expect(
      (
        await x.service.execute('user', 'conversation', {
          operationId: operationId(),
          kind: 'EDIT',
          messageId: 'message',
          text: 'changed',
        })
      ).status,
    ).toBe('FAILED');
    expect(x.api.editText).not.toHaveBeenCalled();
  });
  it('does not retry an UNKNOWN operation on repeated POST', async () => {
    const x = setup();
    x.receipts.claim.mockResolvedValue({ receipt: x.receipt, fresh: false });
    await x.service.execute('user', 'conversation', {
      operationId: operationId(),
      kind: 'EDIT',
      messageId: 'message',
      text: 'changed',
    });
    expect(x.access.withHandle).not.toHaveBeenCalled();
  });
  it('records UNKNOWN when provider timed out and never fabricates success', async () => {
    const x = setup();
    x.api.editText.mockRejectedValue(new Error('timeout'));
    expect(
      (
        await x.service.execute('user', 'conversation', {
          operationId: operationId(),
          kind: 'EDIT',
          messageId: 'message',
          text: 'changed',
        })
      ).status,
    ).toBe('UNKNOWN');
    expect(x.store.confirmed).not.toHaveBeenCalled();
  });
  it('keeps UNKNOWN after Telegram success but DB projection failure', async () => {
    const x = setup();
    x.store.confirmed.mockRejectedValue(new Error('database offline'));
    expect(
      (
        await x.service.execute('user', 'conversation', {
          operationId: operationId(),
          kind: 'EDIT',
          messageId: 'message',
          text: 'changed',
        })
      ).status,
    ).toBe('UNKNOWN');
    expect(x.api.editText).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])(
    'passes exact delete scope revoke=%s to Telegram before tombstone',
    async (revoke) => {
      const x = setup();
      expect(
        (
          await x.service.execute('user', 'conversation', {
            operationId: operationId(),
            kind: 'DELETE',
            messageId: 'message',
            revoke,
          })
        ).status,
      ).toBe('CONFIRMED');
      expect(x.api.deleteMessages).toHaveBeenCalledWith(containing({ revoke }));
      expect(x.store.deleted).toHaveBeenCalledWith(
        conversation,
        [75],
        undefined,
      );
    },
  );
  it('cannot infer deletion for everyone from inaccessible original', async () => {
    const x = setup();
    x.api.getMessage.mockResolvedValue(null);
    expect(
      (
        await x.service.execute('user', 'conversation', {
          operationId: operationId(),
          kind: 'DELETE',
          messageId: 'message',
          revoke: true,
        })
      ).status,
    ).toBe('FAILED');
    expect(x.api.deleteMessages).not.toHaveBeenCalled();
    expect(x.store.deleted).not.toHaveBeenCalled();
  });
  it.each(['👍', null])(
    'sets/removes reaction %s without full-history read',
    async (emoji) => {
      const x = setup();
      expect(
        (
          await x.service.execute('user', 'conversation', {
            operationId: operationId(),
            kind: 'REACTION',
            messageId: 'message',
            emoji,
          })
        ).status,
      ).toBe('CONFIRMED');
      expect(x.api.setReaction).toHaveBeenCalledWith(containing({ emoji }));
    },
  );
  it('forwards using original ID and stable random ID to same-account destination', async () => {
    const x = setup();
    x.access.conversation
      .mockResolvedValueOnce({
        row: conversation,
        access: { workspaceId: 'workspace', memberId: 'member' },
      })
      .mockResolvedValue({
        row: { ...conversation, id: 'target' },
        access: { workspaceId: 'workspace', memberId: 'member' },
      });
    expect(
      (
        await x.service.execute('user', 'conversation', {
          operationId: operationId(),
          kind: 'FORWARD',
          messageId: 'message',
          destinationConversationId: 'target',
        })
      ).status,
    ).toBe('CONFIRMED');
    expect(x.api.forwardMessage).toHaveBeenCalledWith(
      containing({
        telegramMessageId: 75,
        randomId: expect.any(BigInt) as unknown,
      }),
    );
  });
  it('rejects protected forwards without converting them to copied text', async () => {
    const x = setup();
    x.api.getMessage.mockResolvedValue({
      ...normalized,
      contentMetadata: { protectedContent: true },
    });
    expect(
      (
        await x.service.execute('user', 'conversation', {
          operationId: operationId(),
          kind: 'FORWARD',
          messageId: 'message',
          destinationConversationId: 'target',
        })
      ).status,
    ).toBe('FAILED');
    expect(x.api.forwardMessage).not.toHaveBeenCalled();
  });
  it('rejects cross-account forward before operation claim/provider', async () => {
    const x = setup();
    x.access.conversation
      .mockResolvedValueOnce({
        row: conversation,
        access: { workspaceId: 'workspace', memberId: 'member' },
      })
      .mockResolvedValueOnce({
        row: { ...conversation, mtprotoAccountId: 'other' },
        access: { workspaceId: 'workspace', memberId: 'member' },
      });
    await expect(
      x.service.execute('user', 'conversation', {
        operationId: operationId(),
        kind: 'FORWARD',
        messageId: 'message',
        destinationConversationId: 'target',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(x.receipts.claim).not.toHaveBeenCalled();
  });
  it('does not bypass server DNC or ownership denial', async () => {
    const x = setup();
    x.access.conversation.mockRejectedValue(new ForbiddenException());
    await expect(
      x.service.execute('user', 'conversation', {
        operationId: operationId(),
        kind: 'EDIT',
        messageId: 'message',
        text: 'hello',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(x.api.editText).not.toHaveBeenCalled();
  });
  it('reconciles equivalent rich text via read and never repeats edit', async () => {
    const x = setup();
    const markup = '<b>hi 😀</b>';
    x.receipt.request.text = markup;
    const expected = normalizeCrmOutgoingText(markup);
    x.api.getMessage.mockResolvedValue({
      ...normalized,
      text: expected.text,
      contentMetadata: { entities: expected.entities },
    });
    expect(
      (await x.service.status('user', 'conversation', operationId())).status,
    ).toBe('CONFIRMED');
    expect(x.api.editText).not.toHaveBeenCalled();
  });
  it('does not treat same plain text but changed formatting as reconciled', async () => {
    const x = setup();
    x.receipt.request.text = '<b>hello</b>';
    expect(
      (await x.service.status('user', 'conversation', operationId())).status,
    ).toBe('UNKNOWN');
    expect(x.store.confirmed).not.toHaveBeenCalled();
  });
  it('never reconciles unknown forward by executing it again', async () => {
    const x = setup();
    x.receipt.kind = 'FORWARD';
    await x.service.status('user', 'conversation', operationId());
    expect(x.access.withHandle).not.toHaveBeenCalled();
    expect(x.api.forwardMessage).not.toHaveBeenCalled();
  });
  it('protects approved AI message provenance from edit/forward reuse', async () => {
    const x = setup();
    x.prisma.telegramCrmMessage.findFirst.mockResolvedValue({
      ...x.message,
      contentMetadata: { aiDraftId: 'approved' },
    });
    expect(
      (
        await x.service.execute('user', 'conversation', {
          operationId: operationId(),
          kind: 'EDIT',
          messageId: 'message',
          text: 'changed',
        })
      ).status,
    ).toBe('FAILED');
    expect(x.api.editText).not.toHaveBeenCalled();
  });
  it('blocks a new-key forward after reload when the same source has UNKNOWN outcome', async () => {
    const x = setup();
    let pendingTarget: string | undefined;
    const table = {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          if (pendingTarget === data.targetMessageId)
            throw new Prisma.PrismaClientKnownRequestError('pending target', {
              code: 'P2002',
              clientVersion: 'test',
            });
          pendingTarget = data.targetMessageId as string;
          return { ...data, id: 'receipt', status: 'UNKNOWN', result: null };
        }),
    };
    const realReceipts = new TelegramCrmChatReceipts({
      telegramCrmChatOperation: table,
    } as never);
    x.receipts.claim.mockImplementation(
      realReceipts.claim.bind(realReceipts) as never,
    );
    x.api.forwardMessage.mockRejectedValue(new Error('provider response lost'));
    const request = {
      operationId: operationId(),
      kind: 'FORWARD' as const,
      messageId: 'message',
      destinationConversationId: 'target',
    };
    expect(
      (await x.service.execute('user', 'conversation', request)).status,
    ).toBe('UNKNOWN');
    await expect(
      x.service.execute('user', 'conversation', {
        ...request,
        operationId: request.operationId.replace('b83fcfe3', 'b83fcfe4'),
      }),
    ).rejects.toThrow('CHAT_MESSAGE_OPERATION_PENDING');
    expect(x.api.forwardMessage).toHaveBeenCalledTimes(1);
    expect(pendingTarget).toBe('message');
  });
});
