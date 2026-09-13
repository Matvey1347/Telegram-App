import { telegramAdSalesApi } from "@/lib/api";
import { canonicalTelegramUsername } from "../crm/crm-client-field";

export async function ensureCrossPromotionPartnerClient(input: {
  advertiserId: string | null;
  contact: string;
  telegramUsername: string;
}) {
  if (input.advertiserId || !input.contact.trim()) return input.advertiserId;
  const telegramUsername =
    input.telegramUsername || canonicalTelegramUsername(input.contact);
  const advertiser = await telegramAdSalesApi.createAdvertiser({
    displayName: input.contact.trim(),
    telegramUsername: telegramUsername || null,
    source: "DIRECT_MUTUAL_PROMOTION",
  });
  return advertiser.id;
}
