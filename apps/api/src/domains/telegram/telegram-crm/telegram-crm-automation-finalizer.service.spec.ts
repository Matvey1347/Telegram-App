import { TelegramCrmAutomationFinalizerService } from './telegram-crm-automation-finalizer.service';

describe('TelegramCrmAutomationFinalizerService', () => {
  it('reconciles a TELEGRAM_SYNC echo and atomically attributes it to AUTOMATION', async () => {
    const message = { id: 'message-1', origin: 'AUTOMATION' };
    const tx = {
      telegramCrmMessage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'message-1',
          origin: 'TELEGRAM_SYNC',
          automationExecutionId: null,
        }),
        update: jest.fn().mockResolvedValue(message),
        create: jest.fn(),
      },
      telegramCrmConversation: { update: jest.fn() },
      telegramAdvertiser: { update: jest.fn() },
      telegramCrmCustomerAutomationExecution: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((operation) => operation(tx)),
    };
    const service = new TelegramCrmAutomationFinalizerService(prisma as never);
    const sentAt = new Date('2026-09-01T12:00:00Z');

    await expect(
      service.finalize(
        {
          id: 'execution-1',
          workspaceId: 'workspace-1',
          contactId: 'contact-1',
          eventKey: 'deal:deal-1:published-links',
          renderedText: 'All placements are live',
        } as never,
        'worker-1',
        'conversation-1',
        'account-1',
        { telegramMessageId: 42, sentAt },
      ),
    ).resolves.toBe(message);

    expect(tx.telegramCrmMessage.create).not.toHaveBeenCalled();
    expect(tx.telegramCrmMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: 'AUTOMATION',
          sentByMemberId: null,
          mtprotoAccountId: 'account-1',
          automationExecutionId: 'execution-1',
        }),
      }),
    );
    expect(
      tx.telegramCrmCustomerAutomationExecution.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'execution-1',
          leaseOwner: 'worker-1',
          status: 'SENDING',
        },
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    );
  });
});
