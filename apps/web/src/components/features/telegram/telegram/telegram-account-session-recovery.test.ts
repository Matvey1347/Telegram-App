import { describe, expect, it } from "vitest";
import type { TelegramUserAccount } from "@/lib/api";
import {
  requiresTelegramSessionRefresh,
  isTelegramSmsUnavailableError,
  telegramLoginCodeDeliveryMessage,
} from "./telegram-account-session-recovery";

const account = (overrides: Partial<TelegramUserAccount> = {}) =>
  ({
    id: "account-1",
    label: "@owner",
    apiId: "123",
    isPremium: false,
    captionLengthMax: 1024,
    messageLengthMax: 4096,
    status: "error",
    isActive: true,
    ...overrides,
  }) satisfies TelegramUserAccount;

describe("Telegram account session recovery", () => {
  it("offers session refresh only for the revoked-session error", () => {
    expect(
      requiresTelegramSessionRefresh(
        account({
          lastErrorMessage:
            "The connected Telegram account session is no longer valid. Reconnect the account and retry.",
        }),
      ),
    ).toBe(true);
    expect(
      requiresTelegramSessionRefresh(
        account({ lastErrorMessage: "Telegram temporarily unavailable" }),
      ),
    ).toBe(false);
    expect(
      requiresTelegramSessionRefresh(
        account({ status: "connected", lastErrorMessage: undefined }),
      ),
    ).toBe(false);
  });

  it("reports the delivery channel returned by Telegram", () => {
    expect(
      telegramLoginCodeDeliveryMessage({
        success: true,
        status: "needs_code",
        isCodeViaApp: true,
      }),
    ).toContain("official Telegram service chat");
    expect(
      telegramLoginCodeDeliveryMessage({
        success: true,
        status: "needs_code",
        isCodeViaApp: false,
      }),
    ).toContain("phone delivery");
    expect(
      telegramLoginCodeDeliveryMessage({
        success: true,
        status: "needs_code",
        isCodeViaApp: true,
        smsUnavailable: true,
      }),
    ).toContain("refused SMS delivery");
  });

  it("recognizes when Telegram refuses SMS delivery", () => {
    expect(
      isTelegramSmsUnavailableError({
        response: {
          data: {
            message: "406: SEND_CODE_UNAVAILABLE (caused by auth.ResendCode)",
          },
        },
      }),
    ).toBe(true);
  });
});
