import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { financeChatLocale } from '../i18n/finance-chat-i18n';

export const financeObligationProfileSelect = {
  id: true,
  defaultCurrency: true,
  timezone: true,
  locale: true,
  botIntegrationId: true,
  telegramBotUserId: true,
  botIntegration: { select: { workspaceId: true } },
  telegramUser: {
    select: {
      telegramChatId: true,
      runtimeInstanceId: true,
      languageCode: true,
    },
  },
} satisfies Prisma.FinanceProfileSelect;

export type FinanceObligationProfile = Prisma.FinanceProfileGetPayload<{
  select: typeof financeObligationProfileSelect;
}>;

export async function financeObligationProfile(
  tx: Prisma.TransactionClient,
  profileId: string,
) {
  const profile = await tx.financeProfile.findUnique({
    where: { id: profileId },
    select: financeObligationProfileSelect,
  });
  if (!profile) throw new NotFoundException('Finance profile not found');
  return profile;
}

export function financeObligationDeliveryTarget(
  profile: FinanceObligationProfile,
) {
  const chatId = profile.telegramUser.telegramChatId;
  if (!chatId) return null;
  return {
    workspaceId: profile.botIntegration.workspaceId,
    botIntegrationId: profile.botIntegrationId,
    runtimeInstanceId: profile.telegramUser.runtimeInstanceId,
    telegramBotUserId: profile.telegramBotUserId,
    chatId,
    locale: financeChatLocale(
      profile.locale,
      profile.telegramUser.languageCode,
    ),
  };
}
