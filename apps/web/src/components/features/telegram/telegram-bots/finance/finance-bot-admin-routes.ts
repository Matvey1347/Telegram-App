export const financeBotSections = [
  "overview",
  "ads",
  "monetization",
  "users",
  "integrations",
] as const;

export type FinanceBotSection = (typeof financeBotSections)[number];

export function isFinanceBotSection(
  section: string,
): section is FinanceBotSection {
  return financeBotSections.some((value) => value === section);
}

export function financeBotAdminHref(
  botId: string,
  section: FinanceBotSection,
  environment?: string,
) {
  const path = `/telegram-bots/${encodeURIComponent(botId)}/finance/${section}`;
  return environment === "LOCAL" || environment === "PRODUCTION"
    ? `${path}?environment=${environment}`
    : path;
}
