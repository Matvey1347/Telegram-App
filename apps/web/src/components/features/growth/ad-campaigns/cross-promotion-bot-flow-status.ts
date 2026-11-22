import type { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";

export type CrossPromotionBotFlow = ReturnType<
  typeof useTelegramSystemBotPostFlow<"single">
>;

export const idleCrossPromotionBotFlow = {
  importStatus: "idle",
  sendStatus: "idle",
  dots: 1,
} as const;

export function crossPromotionBotFlowForTarget(
  flow: CrossPromotionBotFlow,
  activeTarget: string,
  target: string,
) {
  return activeTarget === target ? flow : idleCrossPromotionBotFlow;
}
