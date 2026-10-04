import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  FinanceReminderDelivery,
  FinanceReminderDeliveryPort,
} from '../../telegram-bots/core/telegram-bot-delivery.ports';
import { financeChatLocale, t } from '../i18n/finance-chat-i18n';

@Injectable()
export class FinanceReminderDeliveryService implements FinanceReminderDeliveryPort {
  constructor(private readonly prisma: PrismaService) {}

  async scheduleNext(
    reminderId: string,
  ): Promise<FinanceReminderDelivery | null> {
    const reminder = await this.prisma.financeReminder.findFirst({
      where: { id: reminderId, enabled: true },
      include: {
        profile: { include: { telegramUser: true, botIntegration: true } },
      },
    });
    if (!reminder || !reminder.profile.telegramUser.telegramChatId) return null;

    const current = reminder.nextOccurrenceAt;
    let year = current.getUTCFullYear();
    let month = current.getUTCMonth() + 1;
    if (month === 12) {
      month = 0;
      year += 1;
    }
    const day = Math.min(
      reminder.dayOfMonth,
      new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    );
    const next = new Date(
      Date.UTC(
        year,
        month,
        day,
        current.getUTCHours(),
        current.getUTCMinutes(),
      ),
    );
    await this.prisma.financeReminder.updateMany({
      where: { id: reminder.id, nextOccurrenceAt: current, enabled: true },
      data: { nextOccurrenceAt: next },
    });

    const locale = financeChatLocale(
      reminder.profile.locale,
      reminder.profile.telegramUser.languageCode,
    );
    return {
      workspaceId: reminder.profile.botIntegration.workspaceId,
      botIntegrationId: reminder.profile.botIntegrationId,
      telegramBotUserId: reminder.profile.telegramBotUserId,
      financeReminderId: reminder.id,
      chatId: reminder.profile.telegramUser.telegramChatId,
      text: t(locale, 'reminderNotification', {
        name: reminder.name,
        amount: reminder.amount.toString(),
        currency: reminder.currency,
      }),
      scheduledAt: new Date(
        next.getTime() - reminder.reminderOffsetMinutes * 60_000,
      ),
      idempotencyKey: `finance-reminder:${reminder.id}:${next.toISOString()}`,
    };
  }
}
