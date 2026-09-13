import { BadGatewayException } from '@nestjs/common';
import { FinanceAiAnalyticsService } from './finance-ai-analytics.service';

describe('FinanceAiAnalyticsService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function setup() {
    const prisma = {
      aiUsageEvent: { update: jest.fn().mockResolvedValue({}) },
    };
    const credentials = {
      key: jest.fn().mockResolvedValue('openai-key'),
    };
    return {
      prisma,
      credentials,
      service: new FinanceAiAnalyticsService(
        prisma as never,
        credentials as never,
      ),
    };
  }

  it('generates bounded analysis and completes the reserved usage event', async () => {
    const { service, prisma } = setup();
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        output_text: JSON.stringify({
          answer: 'Expenses increased in the selected period.',
          suggestedQuestions: ['Which category changed most?'],
        }),
        usage: { input_tokens: 120, output_tokens: 25 },
      }),
    });
    global.fetch = fetchMock;

    await expect(
      service.interpret({
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        question: 'What changed?',
        locale: 'en',
        facts: { summary: { income: '100', expenses: '40' } },
        reservationId: 'reservation-1',
      }),
    ).resolves.toEqual({
      answer: 'Expenses increased in the selected period.',
      suggestedQuestions: ['Which category changed most?'],
    });
    const fetchCalls = fetchMock.mock.calls as unknown as Array<
      [RequestInfo | URL, RequestInit?]
    >;
    const requestBody = fetchCalls[0]?.[1]?.body;
    expect(typeof requestBody).toBe('string');
    const body = JSON.parse(requestBody as string) as {
      store: boolean;
      max_output_tokens: number;
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(700);
    expect(body.input[0].content[0].text).toContain('Aggregate facts');
    const updateCalls = prisma.aiUsageEvent.update.mock
      .calls as unknown as Array<
      [{ where: { id: string }; data: { status: string } }]
    >;
    expect(updateCalls.at(-1)?.[0].where.id).toBe('reservation-1');
    expect(updateCalls.at(-1)?.[0].data.status).toBe('SUCCEEDED');
  });

  it('marks the reservation failed for invalid provider output', async () => {
    const { service, prisma } = setup();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ output_text: '{"answer":""}' }),
    }) as never;

    await expect(
      service.interpret({
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        question: 'What changed?',
        locale: 'en',
        facts: { summary: {} },
        reservationId: 'reservation-1',
      }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    const updateCalls = prisma.aiUsageEvent.update.mock
      .calls as unknown as Array<[{ data: { status: string } }]>;
    expect(updateCalls.at(-1)?.[0].data.status).toBe('FAILED');
  });

  it('routes one assistant message to the right Finance function', async () => {
    const { service } = setup();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        output_text: JSON.stringify({
          kind: 'GUIDANCE',
          message: 'Use debts because this money is still owed to you.',
          recommendedScreen: 'debts',
          operations: [],
        }),
        usage: { input_tokens: 80, output_tokens: 20 },
      }),
    }) as never;

    await expect(
      service.routeAssistantMessage({
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        locale: 'en',
        text: 'A friend still owes me 25 PLN',
        history: [],
        facts: { accountBalances: [], recentTransactions: [] },
        reservationId: 'reservation-1',
      }),
    ).resolves.toEqual({
      kind: 'GUIDANCE',
      message: 'Use debts because this money is still owed to you.',
      recommendedScreen: 'debts',
      operations: [],
    });
  });
});
