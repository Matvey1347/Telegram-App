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
}
