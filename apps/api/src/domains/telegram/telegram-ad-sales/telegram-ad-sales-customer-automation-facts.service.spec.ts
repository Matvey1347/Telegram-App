import { Logger } from '@nestjs/common';
import { TelegramAdSalesCustomerAutomationFactsService } from './telegram-ad-sales-customer-automation-facts.service';

describe('TelegramAdSalesCustomerAutomationFactsService', () => {
  it('does not surface CRM materialization failure after the business commit', async () => {
    const occurrences = {
      recordDealCreated: jest
        .fn()
        .mockRejectedValue(new Error('database asleep')),
    };
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new TelegramAdSalesCustomerAutomationFactsService(
      occurrences as never,
    );

    await expect(service.dealCreated('workspace-1', 'deal-1')).resolves.toBe(
      false,
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining(
        'CRM customer automation fact dealCreated failed',
      ),
    );
    error.mockRestore();
  });
});
