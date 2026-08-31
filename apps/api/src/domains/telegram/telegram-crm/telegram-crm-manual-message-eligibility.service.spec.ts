import { TelegramCrmManualMessageEligibilityService } from './telegram-crm-manual-message-eligibility.service';
import { TelegramCrmManualMessagePolicyService } from './telegram-crm-manual-message-policy.service';

describe('TelegramCrmManualMessageEligibilityService', () => {
  it('requires sendManualMessages and account crmSendEnabled but no automation flag', async () => {
    const authorization = {
      require: jest.fn().mockResolvedValue({ workspaceId: 'workspace-1' }),
      can: jest.fn().mockResolvedValue(true),
    };
    const service = new TelegramCrmManualMessageEligibilityService(
      authorization as never,
      {
        find: jest.fn().mockResolvedValue({
          id: 'account-1',
          crmSendEnabled: true,
        }),
      } as never,
      new TelegramCrmManualMessagePolicyService(),
    );

    await expect(service.evaluate('user-1', 'account-1')).resolves.toEqual({
      allowed: true,
      reason: 'ELIGIBLE',
    });
    expect(authorization.can).toHaveBeenCalledWith(
      'user-1',
      'adSales.crm.sendManualMessages',
    );
  });
});
