import { FinanceEntitlementService } from './finance-entitlement.service';

describe('FinanceEntitlementService', () => {
  it('uses the canonical billing resolver for Finance Pro capabilities', async () => {
    const resolver = {
      resolve: jest.fn().mockResolvedValue({
        capabilities: ['AI_INPUT'],
        hasPaidEntitlement: true,
      }),
    } as never;
    const service = new FinanceEntitlementService(resolver);

    await expect(
      service.has({ botIntegrationId: 'finance-bot', telegramBotUserId: 'user' }, 'AI_INPUT'),
    ).resolves.toBe(true);
    expect((resolver as any).resolve).toHaveBeenCalledWith({
      botIntegrationId: 'finance-bot',
      telegramBotUserId: 'user',
    });
  });
});
