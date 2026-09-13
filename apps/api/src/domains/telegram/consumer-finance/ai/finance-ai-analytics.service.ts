import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  AI_MODEL_POLICY,
  priceAiUsage,
} from '../../telegram-bots/core/ai-usage-cost';
import { FinanceAiCredentialService } from './finance-ai-credential.service';
import {
  requestFinanceStructuredResponse,
  type FinanceAiResponseUsage,
} from './finance-ai-responses.client';
import {
  assertFinanceAiOperation,
  financeAiOperationItemSchema,
  type AiFinanceOperation,
} from './finance-ai.provider';

const analyticsInsightSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['answer', 'suggestedQuestions'],
  properties: {
    answer: { type: 'string', minLength: 1, maxLength: 1200 },
    suggestedQuestions: {
      type: 'array',
      maxItems: 3,
      items: { type: 'string', minLength: 3, maxLength: 120 },
    },
  },
};

const assistantRouteSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'message', 'recommendedScreen', 'operations'],
  properties: {
    kind: {
      type: 'string',
      enum: ['ANSWER', 'CLARIFICATION', 'GUIDANCE', 'RECORD'],
    },
    message: { type: 'string', minLength: 1, maxLength: 1200 },
    recommendedScreen: {
      type: ['string', 'null'],
      enum: [
        'transactions',
        'transfers',
        'debts',
        'regular-payments',
        'savings',
        'investments',
        'analytics',
        'accounts',
        'categories',
        'budget',
        'reminders',
        null,
      ],
    },
    operations: {
      type: 'array',
      maxItems: 10,
      items: financeAiOperationItemSchema,
    },
  },
};

const ASSISTANT_SCREENS = new Set([
  'transactions',
  'transfers',
  'debts',
  'regular-payments',
  'savings',
  'investments',
  'analytics',
  'accounts',
  'categories',
  'budget',
  'reminders',
]);

/** On-demand generated interpretation. Deterministic facts stay in Analytics. */
@Injectable()
export class FinanceAiAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: FinanceAiCredentialService,
  ) {}

  async interpret(input: {
    profileId: string;
    botIntegrationId: string;
    question: string;
    locale: 'en' | 'uk' | 'ru';
    facts: Record<string, unknown>;
    reservationId: string;
  }) {
    const startedAt = Date.now();
    const model = AI_MODEL_POLICY.FINANCE_ANALYSIS;
    let status = 'FAILED';
    let usage: FinanceAiResponseUsage | undefined;
    try {
      const key = await this.credentials.key(
        input.profileId,
        input.botIntegrationId,
      );
      const response = await requestFinanceStructuredResponse({
        apiKey: key,
        model,
        profileId: input.profileId,
        content: [
          {
            type: 'input_text',
            text: `Question: ${input.question}\nAggregate facts: ${JSON.stringify(input.facts)}`,
          },
        ],
        schema: analyticsInsightSchema,
        schemaName: 'finance_analytics_insight',
        maxOutputTokens: 700,
        instructions:
          `You are a personal-finance analysis assistant. Answer in ${input.locale}. ` +
          'Use only the supplied aggregate facts, clearly state uncertainty, and do not invent transactions, causes, or future outcomes.',
        providerFailureMessage: 'Finance AI analysis request failed',
      });
      usage = response.usage;
      const parsed = response.text
        ? (JSON.parse(response.text) as {
            answer?: string;
            suggestedQuestions?: string[];
          })
        : null;
      if (
        !parsed?.answer?.trim() ||
        parsed.answer.length > 1200 ||
        !Array.isArray(parsed.suggestedQuestions) ||
        parsed.suggestedQuestions.length > 3
      ) {
        throw new BadGatewayException(
          'Finance AI returned an invalid analysis',
        );
      }
      status = 'SUCCEEDED';
      return {
        answer: parsed.answer.trim(),
        suggestedQuestions: parsed.suggestedQuestions,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      throw new BadGatewayException(
        'Finance AI analysis timed out or returned invalid output',
      );
    } finally {
      await this.prisma.aiUsageEvent.update({
        where: { id: input.reservationId },
        data: {
          ...priceAiUsage(model, {
            inputTokens: usage?.input_tokens,
            cachedInputTokens: usage?.input_tokens_details?.cached_tokens,
            outputTokens: usage?.output_tokens,
          }),
          latencyMs: Date.now() - startedAt,
          status,
        },
      });
    }
  }

  async routeAssistantMessage(input: {
    profileId: string;
    botIntegrationId: string;
    locale: 'en' | 'uk' | 'ru';
    text: string;
    history: Array<{ role: 'user' | 'assistant'; text: string }>;
    facts: Record<string, unknown>;
    reservationId: string;
  }) {
    const startedAt = Date.now();
    const model = AI_MODEL_POLICY.FINANCE_ANALYSIS;
    let status = 'FAILED';
    let usage: FinanceAiResponseUsage | undefined;
    try {
      const key = await this.credentials.key(
        input.profileId,
        input.botIntegrationId,
      );
      const response = await requestFinanceStructuredResponse({
        apiKey: key,
        model,
        profileId: input.profileId,
        content: [
          {
            type: 'input_text',
            text: `Conversation: ${JSON.stringify(input.history)}\nCurrent message: ${input.text}\nFinance context: ${JSON.stringify(input.facts)}`,
          },
        ],
        schema: assistantRouteSchema,
        schemaName: 'finance_assistant_route',
        maxOutputTokens: 900,
        instructions:
          `You are the primary interface to a personal-finance system. Respond in ${input.locale}. ` +
          'Choose RECORD when the user describes one or more concrete money movements with enough amount, currency, ownership and account context to prepare ledger entries, and return those entries in operations. Use accountHint only for an exact available account name from the supplied context. Resolve dates using the supplied context and never invent an account. ' +
          'Choose CLARIFICATION and ask one focused question when a safe record is missing amount, currency, account, ownership, personal share, participants, or whether money is income, reimbursement, pass-through, debt, transfer, subscription, saving, or investment. ' +
          'Choose GUIDANCE when the user needs a dedicated feature and set recommendedScreen: transfers for movement between own accounts; debts for amounts owed; regular-payments for subscriptions; investments; savings; accounts; categories; budget; reminders; otherwise transactions. Explain why that function fits. ' +
          'Choose ANSWER for analysis or reconciliation questions. Use only supplied facts. When a stated real balance differs from expected account balance, calculate the difference if possible, inspect recent transactions for plausible candidates, clearly label uncertainty, and explain which entry meaning would fix the ledger. Never invent a missing transaction. ' +
          'Cash movement and economic meaning differ: reimbursement and pass-through receipts are not income; debt principal repayment is not expense; shared payments count only the user share as expense; investment flows are separate. Never write data or claim that data was written.',
        providerFailureMessage: 'Finance assistant request failed',
      });
      usage = response.usage;
      const parsed = response.text
        ? (JSON.parse(response.text) as {
            kind?: 'ANSWER' | 'CLARIFICATION' | 'GUIDANCE' | 'RECORD';
            message?: string;
            recommendedScreen?: string | null;
            operations?: AiFinanceOperation[];
          })
        : null;
      if (
        !parsed?.kind ||
        !parsed.message?.trim() ||
        !Array.isArray(parsed.operations) ||
        parsed.operations.length > 10 ||
        (parsed.kind === 'RECORD' && !parsed.operations.length) ||
        (parsed.kind !== 'RECORD' && parsed.operations.length) ||
        (parsed.recommendedScreen !== null &&
          parsed.recommendedScreen !== undefined &&
          !ASSISTANT_SCREENS.has(parsed.recommendedScreen)) ||
        (parsed.kind === 'GUIDANCE' && !parsed.recommendedScreen)
      )
        throw new BadGatewayException(
          'Finance AI returned an invalid assistant response',
        );
      for (const operation of parsed.operations)
        assertFinanceAiOperation(operation);
      status = 'SUCCEEDED';
      return {
        kind: parsed.kind,
        message: parsed.message.trim(),
        recommendedScreen: parsed.recommendedScreen || null,
        operations: parsed.operations,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException
      )
        throw error;
      throw new BadGatewayException(
        'Finance assistant timed out or returned invalid output',
      );
    } finally {
      await this.prisma.aiUsageEvent.update({
        where: { id: input.reservationId },
        data: {
          ...priceAiUsage(model, {
            inputTokens: usage?.input_tokens,
            cachedInputTokens: usage?.input_tokens_details?.cached_tokens,
            outputTokens: usage?.output_tokens,
          }),
          latencyMs: Date.now() - startedAt,
          status,
        },
      });
    }
  }
}
