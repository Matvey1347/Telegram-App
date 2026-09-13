import { BadRequestException } from '@nestjs/common';
import { FinanceAssistantEntryService } from './finance-assistant-entry.service';

const identity = {
  profileId: 'profile-1',
  botIntegrationId: 'bot-1',
  telegramBotUserId: 'user-1',
  workspaceId: 'workspace-1',
};

function setup() {
  const prisma = {
    financeProfile: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'profile-1',
        defaultCurrency: 'PLN',
        timezone: 'Europe/Warsaw',
      }),
    },
  };
  const ai = {
    extractText: jest.fn().mockResolvedValue([
      {
        type: 'EXPENSE',
        amount: '100',
        economicAmount: '25',
        currency: 'PLN',
        description: 'Dinner',
        occurredAt: '2026-09-12T12:00:00.000Z',
      },
    ]),
    extractReceipt: jest.fn(),
    transcribeVoice: jest.fn(),
  };
  const proposals = {
    createBatch: jest.fn().mockResolvedValue({
      token: 'safe-token',
      preview: [
        {
          payload: {
            type: 'EXPENSE',
            amount: '100',
            economicAmount: '25',
            currency: 'PLN',
            description: 'Dinner',
            occurredAt: '2026-09-12T12:00:00.000Z',
          },
          accountName: 'Card',
          categoryName: 'Restaurants',
        },
      ],
    }),
    confirm: jest.fn().mockResolvedValue({
      transactionIds: ['transaction-1'],
      duplicate: false,
    }),
    cancel: jest.fn(),
  };
  return {
    service: new FinanceAssistantEntryService(
      prisma as never,
      ai as never,
      proposals as never,
    ),
    prisma,
    ai,
    proposals,
  };
}

describe('FinanceAssistantEntryService', () => {
  it('returns a reviewable proposal and performs no ledger write', async () => {
    const { service, ai, proposals } = setup();
    await expect(
      service.fromText(identity, 'Paid for dinner'),
    ).resolves.toEqual({
      token: 'safe-token',
      operations: [
        expect.objectContaining({
          amount: '100',
          economicAmount: '25',
          accountName: 'Card',
        }),
      ],
    });
    expect(ai.extractText).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-1',
        timezone: 'Europe/Warsaw',
      }),
    );
    expect(proposals.confirm).not.toHaveBeenCalled();
  });

  it('requires a bounded uploaded file before calling AI', async () => {
    const { service, ai } = setup();
    await expect(service.fromFile(identity, undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ai.extractReceipt).not.toHaveBeenCalled();
    expect(ai.transcribeVoice).not.toHaveBeenCalled();
  });

  it('confirms with the authenticated profile and its real currency', async () => {
    const { service, proposals } = setup();
    await service.confirm(identity, 'safe-token');
    expect(proposals.confirm).toHaveBeenCalledWith({
      token: 'safe-token',
      botIntegrationId: 'bot-1',
      telegramBotUserId: 'user-1',
      profile: {
        id: 'profile-1',
        defaultCurrency: 'PLN',
        workspaceId: 'workspace-1',
      },
    });
  });
});
