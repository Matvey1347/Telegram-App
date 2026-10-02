import { describe, expect, it } from "vitest";
import type { TelegramAdvertiser } from "@telegram-system/shared";
import { existingPartnerClientByTelegramIdentity } from "./cross-promotion-partner-client";

const advertiser = (id: string, telegramUsername: string | null) =>
  ({ id, telegramUsername } as TelegramAdvertiser);

describe("existingPartnerClientByTelegramIdentity", () => {
  it("reuses a client by Telegram handle regardless of @ prefix or casing", () => {
    expect(
      existingPartnerClientByTelegramIdentity(
        [advertiser("existing-a20", "A20_admin")],
        "@a20_ADMIN",
      )?.id,
    ).toBe("existing-a20");
  });

  it("does not turn a VP-only partner into a new CRM client", () => {
    expect(
      existingPartnerClientByTelegramIdentity(
        [advertiser("another", "another_partner")],
        "@puteshestvuiii",
      ),
    ).toBeNull();
  });
});
