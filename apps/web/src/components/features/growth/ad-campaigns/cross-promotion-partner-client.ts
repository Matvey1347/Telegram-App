import type { TelegramAdvertiser } from "@telegram-system/shared";
import { telegramAdSalesApi } from "@/lib/api";
import { canonicalTelegramUsername } from "../crm/crm-client-field";

export function existingPartnerClientByTelegramIdentity(
  advertisers: TelegramAdvertiser[],
  value: string,
) {
  const username = canonicalTelegramUsername(value);
  if (!username) return null;
  return (
    advertisers.find(
      (advertiser) =>
        canonicalTelegramUsername(advertiser.telegramUsername ?? "") === username,
    ) ?? null
  );
}

export async function ensureCrossPromotionPartnerClient(input: {
  advertiserId: string | null;
  contact: string;
  telegramUsername: string;
}) {
  if (input.advertiserId || !input.contact.trim()) return input.advertiserId;
  const telegramUsername =
    input.telegramUsername || canonicalTelegramUsername(input.contact);
  if (!telegramUsername) return null;
  // A mutual-promotion partner is not automatically a CRM client. Reuse an
  // explicitly existing client if there is one, but keep VP-only partners on
  // the promotion itself so they never create duplicate customer cards.
  const advertisers = await telegramAdSalesApi.searchAdvertisers({
    q: telegramUsername,
    limit: 20,
  });
  return existingPartnerClientByTelegramIdentity(advertisers, telegramUsername)
    ?.id ?? null;
}
