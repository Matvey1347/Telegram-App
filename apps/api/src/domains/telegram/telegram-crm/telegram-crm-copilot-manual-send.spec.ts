import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import { TelegramCrmManualSendService } from './telegram-crm-manual-send.service';
import { TelegramCrmCopilotSendGuard } from './telegram-crm-copilot-send-guard.service';
import { TelegramCrmRuntimeManager } from './telegram-crm-runtime-manager.service';
import { TelegramCrmEventHub } from './telegram-crm-event-hub.service';
import { SendCrmManualMessageDto } from './telegram-crm-inbox.dto';

function fixture() {
  const conversation = {
    id: 'conversation',
    workspaceId: 'ws',
    contactId: null,
    mtprotoAccountId: 'sender',
    telegramAccessHash: 'hash',
    peer: { id: 'peer', telegramUserId: '123', username: 'client' },
    contact: null,
  };
  const prisma = {
    telegramCrmConversation: {
      findFirst: jest.fn().mockResolvedValue(conversation),
    },
    telegramCrmMessage: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const authorization = {
    refresh: jest.fn().mockResolvedValue({}),
    require: jest
      .fn()
      .mockResolvedValue({ workspaceId: 'ws', memberId: 'member' }),
    requireOwnOrAny: jest.fn().mockResolvedValue(undefined),
    scope: jest.fn().mockResolvedValue({}),
  };
  const handle = { sendText: jest.fn() };
  const runtime = {
    withAccountHandle: jest.fn(
      (
        _workspace: string,
        _account: string,
        _purpose: string,
        operation: (sender: typeof handle) => Promise<unknown>,
      ) => operation(handle),
    ),
  };
  const guard = {
    assertCanSend: jest.fn().mockResolvedValue(undefined),
    markSent: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TelegramCrmManualSendService(
    prisma as unknown as PrismaService,
    authorization as unknown as WorkspaceAuthorizationService,
    runtime as unknown as TelegramCrmRuntimeManager,
    { emit: jest.fn() } as unknown as TelegramCrmEventHub,
    undefined,
    guard as unknown as TelegramCrmCopilotSendGuard,
  );
  const input: SendCrmManualMessageDto = {
    text: 'Вітаю!',
    aiDraftId: 'draft',
    aiDraftRevision: 3,
    clientIdempotencyKey: 'ai:draft:3',
  };
  const receipt = {
    id: 'message',
    workspaceId: 'ws',
    conversationId: 'conversation',
    telegramMessageId: '42',
    telegramMessageIdNumeric: 42,
    clientIdempotencyKey: input.clientIdempotencyKey,
    mtprotoAccountId: 'sender',
    direction: 'OUTBOUND',
    origin: 'MANUAL',
    sentByMemberId: 'member',
    text: input.text,
    contentMetadata: { aiDraftId: 'draft', aiDraftRevision: 3 },
    sentAt: new Date(),
    editedAt: null,
    readState: 'UNKNOWN',
    deliveryState: 'SENT',
    createdAt: new Date(),
    sentByMember: null,
  };
  return { service, prisma, handle, runtime, guard, input, receipt };
}
describe('AI manual-send provenance contract', () => {
  it.each(['ordinary-key', 'ai:another:3'])(
    'requires canonical AI key %s before replay/network',
    async (key) => {
      const h = fixture();
      await expect(
        h.service.send('user', 'conversation', {
          ...h.input,
          clientIdempotencyKey: key,
        }),
      ).rejects.toThrow('COPILOT_IDEMPOTENCY_KEY_REQUIRED');
      expect(h.prisma.telegramCrmMessage.findUnique).not.toHaveBeenCalled();
      expect(h.handle.sendText).not.toHaveBeenCalled();
    },
  );
  it('reserves the ai: namespace and requires complete provenance', async () => {
    const h = fixture();
    await expect(
      h.service.send('user', 'conversation', {
        text: h.input.text,
        clientIdempotencyKey: 'ai:draft:3',
      }),
    ).rejects.toThrow('COPILOT_APPROVAL_REQUIRED');
    await expect(
      h.service.send('user', 'conversation', {
        ...h.input,
        aiDraftRevision: undefined,
      }),
    ).rejects.toThrow('COPILOT_APPROVAL_INCOMPLETE');
    expect(h.runtime.withAccountHandle).not.toHaveBeenCalled();
  });
  it('checks fresh approval inside the account handle immediately before network send', async () => {
    const h = fixture();
    h.guard.assertCanSend.mockRejectedValue(
      new Error('fresh DNC or permission revoked'),
    );
    await expect(
      h.service.send('user', 'conversation', h.input),
    ).rejects.toThrow('fresh DNC or permission revoked');
    expect(h.guard.assertCanSend).toHaveBeenCalledWith(
      'user',
      'conversation',
      h.input.text,
      { aiDraftId: 'draft', aiDraftRevision: 3 },
    );
    expect(h.handle.sendText).not.toHaveBeenCalled();
    expect(h.guard.markSent).not.toHaveBeenCalled();
  });
  it('does not attach an old ordinary receipt to a draft', async () => {
    const h = fixture();
    h.prisma.telegramCrmMessage.findUnique.mockResolvedValue({
      ...h.receipt,
      contentMetadata: null,
    });
    await expect(
      h.service.send('user', 'conversation', h.input),
    ).rejects.toThrow('COPILOT_RECEIPT_MISMATCH');
    expect(h.guard.markSent).not.toHaveBeenCalled();
    expect(h.handle.sendText).not.toHaveBeenCalled();
  });
  it('reconciles an existing proven AI receipt without sending or generating again', async () => {
    const h = fixture();
    h.prisma.telegramCrmMessage.findUnique.mockResolvedValue(h.receipt);
    expect(await h.service.send('user', 'conversation', h.input)).toMatchObject(
      {
        idempotentReplay: true,
        message: {
          contentMetadata: { aiDraftId: 'draft', aiDraftRevision: 3 },
        },
      },
    );
    expect(h.guard.markSent).toHaveBeenCalledWith(
      'user',
      'conversation',
      { aiDraftId: 'draft', aiDraftRevision: 3 },
      'message',
      'ws',
    );
    expect(h.handle.sendText).not.toHaveBeenCalled();
  });
});
