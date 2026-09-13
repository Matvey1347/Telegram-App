import type { ResolvedEmoji, Transaction } from "@/lib/api";

export function transactionAvatar(
  transaction: Transaction,
): ResolvedEmoji | null | undefined {
  if (transaction.iconPresentation) return transaction.iconPresentation;

  const channel =
    transaction.telegramChannel ?? transaction.purchasedTelegramChannel;
  if (channel?.photoUrl) {
    return {
      type: "image",
      id: channel.id,
      url: channel.photoUrl,
      name: channel.title,
    };
  }

  const investorAvatar = transaction.member?.avatarPresentation;
  const categoryKey = transaction.categoryRef?.key?.trim().toLowerCase();
  const categoryName = (transaction.categoryRef?.name ?? transaction.category)
    ?.trim()
    .toLowerCase();
  const isInvestment =
    Boolean(transaction.investment) ||
    categoryKey === "investment" ||
    categoryName === "investment";
  if (isInvestment && investorAvatar) {
    return investorAvatar;
  }

  return (
    transaction.categoryRef?.iconPresentation ??
    transaction.account?.iconPresentation
  );
}
