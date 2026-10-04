import { HttpException } from '@nestjs/common';
import type { TelegramBotApplicationContext } from '@api/domains/telegram/telegram-bots/core/telegram-bot-update.types';
import type { TelegramBotApiClient } from '@api/telegram/shared/bot/telegram-bot-api.client';
import type { TelegramBotInteractiveReplyService } from '@api/telegram/shared/bot/telegram-bot-interactive-reply.service';
import type { FinanceUltimateService } from '@finance-pro/api/ultimate/finance-ultimate.service';
import type { FinanceAssistantEntryService } from '@finance-pro/api/ultimate/finance-assistant-entry.service';
import type { FinanceBotChatResponderService } from '@finance-pro/bot/finance-bot-chat-responder.service';
import { sendFinanceTyping } from '@finance-pro/bot/finance-bot-telegram-interactions';
import { financeMiniAppUrl } from '@finance-pro/api/telegram-presentation/finance-telegram-menu';
import {
  t,
  type FinanceChatLocale,
} from '@finance-pro/api/i18n/finance-chat-i18n';
import { financeBotProButtons } from '@finance-pro/bot/finance-bot-pro-buttons';

export async function sendFinanceAssistantReply(input: {
  context: TelegramBotApplicationContext;
  profile: { id: string };
  telegramBotUserId: string;
  chatId: string;
  locale: FinanceChatLocale;
  text: string;
  assistant?: FinanceUltimateService;
  entries?: FinanceAssistantEntryService;
  interactive: TelegramBotInteractiveReplyService;
  botApi: TelegramBotApiClient;
  chat: FinanceBotChatResponderService;
}) {
  const {
    context,
    profile,
    telegramBotUserId,
    chatId,
    locale,
    text,
    assistant,
    entries,
    interactive,
    botApi,
    chat,
  } = input;
  await sendFinanceTyping(botApi, context.token, chatId);
  try {
    if (!assistant) throw new Error('Jarvis is unavailable');
    const result = await assistant.message(
      {
        profileId: profile.id,
        botIntegrationId: context.bot.id,
        workspaceId: context.bot.workspaceId,
        telegramBotUserId,
      },
      { text, history: [] },
    );
    const proposalPreview = result.proposal?.operations
      .map(
        (operation, index) =>
          `${index + 1}. ${operation.type === 'EXPENSE' ? '💸' : '💰'} ${operation.description}\n${operation.amount} ${operation.currency} · ${operation.accountName}`,
      )
      .join('\n\n');
    const recommendedUrl = result.recommendedScreen
      ? financeMiniAppUrl(context.bot.id, undefined, result.recommendedScreen)
      : null;
    await interactive.send(context.token, chatId, {
      text: [
        result.message,
        proposalPreview,
        result.proposal ? t(locale, 'review') : null,
      ]
        .filter(Boolean)
        .join('\n\n'),
      inlineButtons: result.proposal
        ? chat.proposalButtons(result.proposal.token)
        : recommendedUrl
          ? [
              [
                {
                  text: t(locale, 'openRecommended'),
                  webAppUrl: recommendedUrl,
                },
              ],
            ]
          : undefined,
    });
  } catch (error) {
    try {
      if (!entries) throw error;
      const proposal = await entries.fromText(
        {
          profileId: profile.id,
          botIntegrationId: context.bot.id,
          workspaceId: context.bot.workspaceId,
          telegramBotUserId,
        },
        text,
      );
      const preview = proposal.operations
        .map(
          (operation, index) =>
            `${index + 1}. ${operation.type === 'EXPENSE' ? '💸' : '💰'} ${operation.description}\n${operation.amount} ${operation.currency} · ${operation.categoryName || t(locale, 'other')} · ${operation.accountName}`,
        )
        .join('\n\n');
      await interactive.send(context.token, chatId, {
        text: [t(locale, 'suggested', { count: proposal.operations.length }), preview, t(locale, 'review')]
          .filter(Boolean)
          .join('\n\n'),
        inlineButtons: chat.proposalButtons(proposal.token),
      });
      return;
    } catch {
      // The fallback deliberately uses the same proposal service as Web/Mini App.
    }
    const limitReached =
      error instanceof HttpException && error.getStatus() === 429;
    await interactive.send(context.token, chatId, {
      text: t(locale, limitReached ? 'assistantLimit' : 'assistantError'),
      inlineButtons: limitReached
        ? financeBotProButtons(context.bot.id, locale)
        : undefined,
    });
  }
}
