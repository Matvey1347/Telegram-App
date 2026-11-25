"use client";

import { useMutation } from "@tanstack/react-query";
import type { PublicationConfirmationDelivery } from "@telegram-system/shared";
import { useAppToast } from "@/providers/toast-provider";

const messages: Record<PublicationConfirmationDelivery["status"], string> = {
  SENT: "Confirmation sent to Telegram.",
  NOT_CONNECTED: "Connect the selected Telegram recipient in Notifications.",
  NOT_CONFIGURED: "The system bot is unavailable.",
  DISABLED: "Enable this confirmation in Notifications.",
};

export function useSendPublicationConfirmation(
  send: (id: string) => Promise<PublicationConfirmationDelivery>,
) {
  const { pushToast } = useAppToast();
  return useMutation({
    mutationFn: send,
    onSuccess: ({ status }) =>
      pushToast(messages[status], status === "SENT" ? "success" : "error"),
    onError: () => pushToast("Could not send the confirmation to Telegram.", "error"),
  });
}
