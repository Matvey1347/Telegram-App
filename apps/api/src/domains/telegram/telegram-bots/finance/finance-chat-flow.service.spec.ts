import { FinanceChatFlowService } from './finance-chat-flow.service';

describe('FinanceChatFlowService', () => {
  const flow = { id: 'flow-1', status: 'ACTIVE', step: 'ACCOUNT_NAME', payload: {}, expiresAt: new Date(Date.now() + 60_000) };
  const prisma = { financeChatFlow: { upsert: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() } };
  const core = { createAccount: jest.fn() };
  const service = new FinanceChatFlowService(prisma as any, core as any);

  beforeEach(() => jest.clearAllMocks());

  it('persists the short account wizard and creates exactly once after a claimed balance step', async () => {
    prisma.financeChatFlow.findUnique
      .mockResolvedValueOnce(flow)
      .mockResolvedValueOnce({ ...flow, step: 'ACCOUNT_CURRENCY', payload: { name: 'Travel' } })
      .mockResolvedValueOnce({ ...flow, step: 'ACCOUNT_BALANCE', payload: { name: 'Travel', currency: 'EUR' } });
    prisma.financeChatFlow.updateMany.mockResolvedValue({ count: 1 });
    core.createAccount.mockResolvedValue({ id: 'account-1', name: 'Travel', currency: 'EUR', openingBalance: { toString: () => '12.50' } });

    await expect(service.consume({ profileId: 'profile-1', botIntegrationId: 'bot-1', telegramBotUserId: 'user-1', text: 'Travel' })).resolves.toEqual({ kind: 'currency', name: 'Travel' });
    await expect(service.consume({ profileId: 'profile-1', botIntegrationId: 'bot-1', telegramBotUserId: 'user-1', text: 'EUR' })).resolves.toEqual({ kind: 'balance' });
    await expect(service.consume({ profileId: 'profile-1', botIntegrationId: 'bot-1', telegramBotUserId: 'user-1', text: '12.50' })).resolves.toEqual({ kind: 'created', name: 'Travel', currency: 'EUR', balance: '12.50' });
    expect(core.createAccount).toHaveBeenCalledTimes(1);
  });

  it('does not resume expired or isolated flows', async () => {
    prisma.financeChatFlow.findUnique.mockResolvedValue({ ...flow, expiresAt: new Date(Date.now() - 1) });
    await expect(service.consume({ profileId: 'profile-1', botIntegrationId: 'other-bot', telegramBotUserId: 'user-1', text: 'Cash' })).resolves.toBeNull();
    expect(prisma.financeChatFlow.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'EXPIRED' } }));
  });
});
