"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  MutualPromotionFolderDetail,
  UpdateMutualPromotionInviteLinksPayload,
} from "@telegram-system/shared";
import { mutualPromotionFoldersApi } from "@/lib/features/growth/mutual-promotion-folders-api";
import { mutualPromotionFolderKeys } from "@/lib/query-keys";
import { MutualPromotionInviteLinksModal } from "./mutual-promotion-invite-links-modal";

export function MutualPromotionInviteLinksEditor({
  folder,
  open,
  onClose,
  onSaved,
}: {
  folder: MutualPromotionFolderDetail | null;
  open: boolean;
  onClose: () => void;
  onSaved: (folder: MutualPromotionFolderDetail) => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: UpdateMutualPromotionInviteLinksPayload) =>
      mutualPromotionFoldersApi.updateInviteLinks(folder!.id, payload),
    onSuccess: async (updated) => {
      await onSaved(updated);
      await queryClient.invalidateQueries({
        queryKey: mutualPromotionFolderKeys.inviteOptionsRoot(),
      });
      onClose();
    },
  });

  if (!folder) return null;
  return (
    <MutualPromotionInviteLinksModal
      key={`${folder.id}:${folder.updatedAt}`}
      open={open}
      folder={folder}
      saving={mutation.isPending}
      error={
        mutation.isError
          ? "Could not replace the invite links. Check availability and try again."
          : null
      }
      onClose={onClose}
      onSubmit={(payload) =>
        mutation.mutateAsync(payload).then(() => undefined)
      }
    />
  );
}
