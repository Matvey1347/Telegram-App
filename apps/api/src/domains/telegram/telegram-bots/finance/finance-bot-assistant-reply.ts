import { HttpException } from '@nestjs/common';
import type { TelegramBotApplicationContext } from '../core/telegram-bot-update.types';
import type { TelegramBotApiClient } from '../../../../telegram/shared/telegram-bot-api.client';
import type { TelegramBotInteractiveReplyService } from '../../../../telegram/shared/telegram-bot-interactive-reply.service';
import type { FinanceUltimateService } from '../../consumer-finance/ultimate/finance-ultimate.service';
import type { FinanceBotChatResponderService } from './finance-bot-chat-responder.service';
import { sendFinanceTyping } from './finance-bot-telegram-interactions';
import { financeMiniAppUrl } from '../../consumer-finance/telegram-presentation/finance-telegram-menu';
import {
  t,
  type FinanceChatLocale,
} from '../../consumer-finance/i18n/finance-chat-i18n';
import { financeBotProButtons } from './finance-bot-pro-buttons';

export async function sendFinanceAssistantReply(input: {
  context: TelegramBotApplicationContext;
  profile: { id: string };
  telegramBotUserId: string;
  chatId: string;
  locale: FinanceChatLocale;
  text: string;
  assistant?: FinanceUltimateService;
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
