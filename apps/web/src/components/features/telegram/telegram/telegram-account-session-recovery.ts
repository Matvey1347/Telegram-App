import type { TelegramLoginStartResponse } from "@telegram-system/shared";
import type { TelegramUserAccount } from "@/lib/api";

const REVOKED_SESSION_MESSAGE =
  "The connected Telegram account session is no longer valid. Reconnect the account and retry.";

export function requiresTelegramSessionRefresh(account: TelegramUserAccount) {
  return (
    account.status === "error" &&
    account.lastErrorMessage === REVOKED_SESSION_MESSAGE
  );
}

export function telegramLoginCodeDeliveryMessage(
  response: TelegramLoginStartResponse,
) {
  if (response.smsUnavailable) {
    return "Telegram refused SMS delivery and sent a fresh login code to the official Telegram service chat instead.";
  }
  return response.isCodeViaApp
    ? "Telegram sent the login code to the official Telegram service chat."
    : "Telegram accepted the request and selected phone delivery for the login code.";
}

export function isTelegramSmsUnavailableError(error: unknown) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return /SEND_CODE_UNAVAILABLE/i.test(
    responseError.response?.data?.message || "",
  );
}
