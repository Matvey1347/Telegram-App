"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { telegramChannelsApi } from "@/lib/api";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

export function useRegisterTelegramInviteLink({
  channelId,
  onRegistered,
  onPendingChange,
}: {
  channelId: string;
  onRegistered: (link: { id: string }, url: string) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { startOperation } = useAppToast();

  return useMutation({
    onMutate: () => onPendingChange?.(true),
    mutationFn: async (url: string) => {
      const operation = startOperation({
        id: `invite-link-register:${channelId}`,
        title: "Invite link",
        message: "Verifying and adding the invite link…",
      });
      try {
        const result = await telegramChannelsApi.registerInviteLink(
          channelId,
          url.trim(),
        );
        operation.succeed({ message: "Invite link added successfully." });
        return result;
      } catch (error) {
        operation.fail({
          message: "The invite link could not be verified with Telegram.",
        });
        throw error;
      }
    },
    onSuccess: async (result, url) => {
      onRegistered(result, url.trim());
      await queryClient.invalidateQueries({
        queryKey: telegramChannelKeys.inviteLinks(channelId),
      });
    },
    onSettled: () => onPendingChange?.(false),
  });
}
