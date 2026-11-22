"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TelegramChannel } from "@/lib/api";
import { IconPicker } from "@/components/icons/icon-picker";
import { Button, FormField } from "@/components/ui/primitives";
import { channelAvatarEmojiApi } from "@/lib/features/telegram/channel-avatar-emoji-api";
import { patchTelegramChannelCaches } from "@/lib/features/telegram/telegram-channel-cache";
import { workspaceKeys } from "@/lib/query-keys";

export function ChannelAvatarEmojiControl({
  channel,
  selectedIconId,
  selectionDirty,
  onChange,
}: {
  channel: TelegramChannel;
  selectedIconId: string | null;
  selectionDirty?: boolean;
  onChange: (iconId: string | null, manualChange?: boolean) => void;
}) {
  const client = useQueryClient();
  const [result, setResult] = useState<{
    source: TelegramChannel;
    value: TelegramChannel;
  } | null>(null);
  // Keep the command response until the parent supplies its next authoritative version.
  const current = result?.source === channel ? result.value : channel;
  const displayedIconId =
    selectionDirty === false
      ? current.presentationIconId || null
      : selectedIconId;
  const changed =
    (displayedIconId || null) !== (current.presentationIconId || null);
  const operation = useMutation({
    mutationFn: (action: "refresh" | "restore") =>
      channelAvatarEmojiApi[action](channel.id),
    onSuccess: (updated) => {
      setResult({ source: channel, value: updated });
      patchTelegramChannelCaches(client, updated, {
        invalidateNetworks:
          updated.presentationIconId !== current.presentationIconId,
      });
      void client.invalidateQueries({
        queryKey: workspaceKeys.telegramCustomEmojiPacks(),
      });
      onChange(updated.presentationIconId || null, false);
    },
  });
  return (
    <FormField label="Channel emoji">
      <div className="space-y-2" aria-busy={operation.isPending}>
        <div className="flex flex-wrap items-center gap-2">
          <IconPicker
            iconId={displayedIconId}
            icon={current.presentationIconPresentation}
            onChange={(iconId) => onChange(iconId, true)}
            allowImages={false}
            disabled={operation.isPending}
            compact
            buttonLabel="Choose emoji"
            iconOnly
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={operation.isPending || changed}
              onClick={() => operation.mutate("refresh")}
            >
              {operation.isPending && operation.variables === "refresh"
                ? "Обновляем emoji…"
                : "Обновить emoji из аватарки"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={
                operation.isPending ||
                changed ||
                !current.avatarEmojiIconId ||
                !current.avatarEmojiManual
              }
              onClick={() => operation.mutate("restore")}
            >
              Вернуть аватарку как иконку
            </Button>
          </div>
        </div>
        <p className="text-xs text-neutral-400" role="status">
          {changed
            ? "Сохраните выбранную иконку перед обновлением аватарки."
            : current.avatarEmojiManual
              ? "Выбрана ручная иконка. Обновление аватарки её не заменит."
              : current.avatarEmojiStatus === "NO_AVATAR"
                ? "У канала нет аватарки. Используется обычная иконка."
                : current.avatarEmojiStatus === "PENDING"
                  ? "Emoji аватарки создаётся. Проверить результат можно кнопкой обновления."
                  : current.avatarEmojiStatus === "READY"
                    ? "Используется emoji аватарки канала."
                    : "Emoji создаётся из актуальной аватарки Telegram."}
        </p>
        {(operation.isError || current.avatarEmojiStatus === "ERROR") && (
          <p className="text-sm text-rose-300" role="alert">
            {current.avatarEmojiError ||
              "Не удалось обновить emoji. Попробуйте обновление ещё раз."}
          </p>
        )}
      </div>
    </FormField>
  );
}
