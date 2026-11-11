import {
  BadGatewayException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiGateway } from '../../operations/ai/ai-gateway';
import { writeTelegramAiPostingSettingsVersion } from './telegram-ai-posting-settings-version.store';

type Run = {
  stage: string;
  attempt: number;
  operationId: string;
  category: string;
  model: string;
  status: string;
  actualCost: string | null;
  pricingStatus: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

@Injectable()
export class TelegramAiPostingRuleFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly gateway: AiGateway,
  ) {}
  async suggestRuleChange(
    userId: string,
    channelId: string,
    runId: string,
    expectedVersion: number,
    feedbackText: string,
  ) {
    if (!feedbackText.trim() || feedbackText.length > 2000)
      throw new ConflictException('AI_POSTING_FEEDBACK_INVALID');
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    const run = await this.prisma.telegramAiPostingTestRun.findFirst({
      where: { id: runId, workspaceId, telegramChannelId: channelId },
    });
    if (!run) throw new NotFoundException('AI Posting test run not found');
    if (run.version !== expectedVersion)
      throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
    const postingSettings =
      await this.prisma.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        select: { aiDailyBudget: true, aiMonthlyBudget: true },
      });
    const priorOperations = run.operations as unknown as Run[];
    const attempt =
      priorOperations.filter((operation) => operation.stage === 'text').length +
      1;
    const response = await this.gateway.execute({
      userId,
      workspaceId,
      category: 'TELEGRAM_POSTING_TEXT',
      operationId: `${new Date().toISOString().slice(0, 10)}:${randomUUID()}`,
      mode: 'MANUAL',
      input: `Return only one JSON object matching exactly one of these forms: {"type":"add_rule","text":string,"reason":string} | {"type":"set_ending","value":string,"reason":string} | {"type":"append_description","text":string,"reason":string}. Suggest a concise persistent change from the owner's feedback. Do not return legacy keys such as topic, audience, style, or instructions. Feedback: ${feedbackText}`,
      businessObjectId: channelId,
      aiPosting: {
        channelId,
        testRunId: run.id,
        attempt,
        postingMode: 'TEST',
        dailyBudget: null,
        monthlyBudget: postingSettings?.aiMonthlyBudget?.toString() ?? null,
      },
    });
    const operation: Run = {
      stage: 'text',
      attempt,
      operationId: response.operation.operationId,
      category: response.operation.category,
      model: response.operation.model,
      status: response.operation.status,
      actualCost: response.operation.actualCost,
      pricingStatus: response.operation.pricingStatus,
      inputTokens: response.operation.inputTokens,
      outputTokens: response.operation.outputTokens,
    };
    const operations = run.operations as unknown as Run[];
    operations.push(operation);
    const feedback = run.feedback as unknown as Array<Record<string, unknown>>;
    const persistFailure = async (code: string) => {
      const changed = await this.prisma.telegramAiPostingTestRun.updateMany({
        where: { id: run.id, workspaceId, version: expectedVersion },
        data: {
          feedback: [
            ...feedback,
            {
              id: randomUUID(),
              feedback: feedbackText.trim(),
              status: 'FAILED',
              reason: code,
            },
          ] as Prisma.InputJsonArray,
          operations: operations as unknown as Prisma.InputJsonArray,
          textCost: addKnownCost(
            run.textCost?.toString() ?? null,
            response.operation.actualCost,
            response.operation.pricingStatus,
          ),
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
      throw new BadGatewayException(code);
    };
    if (
      response.operation.status !== 'SUCCEEDED' ||
      !response.result ||
      typeof response.result !== 'object'
    )
      return persistFailure('AI_POSTING_RULE_SUGGESTION_FAILED');
    const proposal = this.parseJson(
      (response.result as { reply?: string }).reply ?? '',
    );
    const type = proposal?.type;
    if (
      !proposal ||
      !['add_rule', 'set_ending', 'append_description'].includes(
        String(type),
      ) ||
      (type === 'set_ending' && typeof proposal.value !== 'string') ||
      (type !== 'set_ending' && typeof proposal.text !== 'string') ||
      (type === 'set_ending' && !(proposal.value as string).trim()) ||
      (type !== 'set_ending' && !(proposal.text as string).trim()) ||
      typeof proposal.reason !== 'string'
    )
      return persistFailure('AI_POSTING_RULE_SUGGESTION_INVALID');
    const suggestion = {
      id: randomUUID(),
      feedback: feedbackText.trim(),
      type,
      ...(type === 'set_ending'
        ? { value: String(proposal.value).slice(0, 1000) }
        : { text: String(proposal.text).slice(0, 1000) }),
      reason: proposal.reason.slice(0, 1000),
      status: 'PENDING_CONFIRMATION',
    };
    const changed = await this.prisma.telegramAiPostingTestRun.updateMany({
      where: { id: run.id, workspaceId, version: expectedVersion },
      data: {
        feedback: [...feedback, suggestion] as Prisma.InputJsonArray,
        operations: operations as unknown as Prisma.InputJsonArray,
        textCost: addKnownCost(
          run.textCost?.toString() ?? null,
          response.operation.actualCost,
          response.operation.pricingStatus,
        ),
        version: { increment: 1 },
      },
    });
    if (!changed.count)
      throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
    return { suggestion, version: expectedVersion + 1 };
  }

  async confirmRuleChange(
    userId: string,
    channelId: string,
    runId: string,
    suggestionId: string,
    expectedVersion: number,
  ) {
    const workspaceId = await this.workspace.resolveWorkspaceIdForUser(userId);
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.telegramAiPostingTestRun.findFirst({
        where: { id: runId, workspaceId, telegramChannelId: channelId },
      });
      if (!run) throw new NotFoundException('AI Posting test run not found');
      if (run.version !== expectedVersion)
        throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
      const feedback = run.feedback as unknown as Array<
        Record<string, unknown>
      >;
      const proposal = feedback.find(
        (entry) =>
          entry.id === suggestionId && entry.status === 'PENDING_CONFIRMATION',
      );
      if (!proposal)
        throw new NotFoundException('AI Posting rule suggestion not found');
      const settings = await tx.telegramAiPostingSettings.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
      });
      if (!settings)
        throw new NotFoundException('AI_POSTING_SETTINGS_REQUIRED');
      const configuration = settings.configuration as Record<string, unknown>;
      const type = proposal.type;
      const value = typeof proposal.value === 'string' ? proposal.value : '';
      const text =
        typeof proposal.text === 'string' ? proposal.text.trim() : '';
      if (type === 'add_rule') {
        const rules = Array.isArray(configuration.rules)
          ? (configuration.rules as Array<Record<string, unknown>>)
          : [];
        if (!rules.some((rule) => rule.text === text))
          rules.push({
            id: randomUUID(),
            text,
            source: 'feedback',
            active: true,
            createdAt: new Date().toISOString(),
            feedbackId: suggestionId,
          });
        configuration.rules = rules;
      } else if (type === 'set_ending') {
        configuration.ending = value;
      } else if (type === 'append_description') {
        const current =
          typeof configuration.channelDescription === 'string'
            ? configuration.channelDescription.trim()
            : '';
        if (!current.split(/\n{2,}/).includes(text))
          configuration.channelDescription = [current, text]
            .filter(Boolean)
            .join('\n\n');
      } else {
        throw new ConflictException('AI_POSTING_RULE_SUGGESTION_INVALID');
      }
      proposal.status = 'APPLIED';
      const updatedSettings = await tx.telegramAiPostingSettings.updateMany({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          configurationVersion: settings.configurationVersion,
        },
        data: {
          configuration: configuration as Prisma.InputJsonObject,
          configurationVersion: { increment: 1 },
        },
      });
      if (!updatedSettings.count)
        throw new ConflictException('AI_POSTING_SETTINGS_CHANGED');
      await writeTelegramAiPostingSettingsVersion(tx, {
        settingsId: settings.id,
        version: settings.configurationVersion + 1,
        configuration: configuration as Prisma.InputJsonObject,
        changeSource: 'feedback',
      });
      const changed = await tx.telegramAiPostingTestRun.updateMany({
        where: { id: run.id, workspaceId, version: expectedVersion },
        data: {
          feedback: feedback as Prisma.InputJsonArray,
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException('AI_POSTING_TEST_RUN_CHANGED');
      return { applied: true, version: expectedVersion + 1 };
    });
  }

  private parseJson(value: string): Record<string, any> | null {
    const cleaned = value
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    try {
      const parsed: unknown = JSON.parse(cleaned);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, any>)
        : null;
    } catch {
      return null;
    }
  }
}

function addKnownCost(
  current: string | null,
  next: string | null,
  pricingStatus: string,
) {
  if (current === null || (next === null && pricingStatus !== 'NOT_SENT'))
    return null;
  return new Prisma.Decimal(current).add(next ?? 0);
}
