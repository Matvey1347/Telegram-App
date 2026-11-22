"use client";

import { useState } from "react";
import {
  telegramChannelsApi,
  type BulkActionResult,
  type TelegramChannelSelectOption as TelegramChannel,
  type TelegramManagedPost,
} from "@/lib/api";
import {
  Button,
  CustomSelect,
  FormField,
  Modal,
} from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import {
  BulkProgressOverlay,
  type ProgressState,
} from "@/components/features/telegram/telegram/telegram-posts-workspace-controls";

export function MovePostModal({
  post,
  channels,
  sourceChannelId,
  onClose,
  onMoved,
}: {
  post: TelegramManagedPost;
  channels: TelegramChannel[];
  sourceChannelId: string;
  onClose: () => void;
  onMoved: (result: BulkActionResult, targetId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t("telegram.posts.editor.movePost")}
        loading={busy}
        allowOverflow
      >
        <div className="space-y-4">
          <p className="text-sm text-amber-200">
            {t("telegram.posts.editor.moveDescription")}
          </p>
          <FormField label={t("telegram.posts.editor.targetChannel")} required>
            <CustomSelect
              value={targetId}
              onChange={setTargetId}
              options={channels
                .filter((channel) => channel.id !== sourceChannelId)
                .map((channel) => ({
                  value: channel.id,
                  label: channel.title,
                  iconUrl: channel.photoUrl || undefined,
                }))}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!targetId || busy}
              onClick={async () => {
                if (!targetId) return;
                setBusy(true);
                setProgress({
                  title: t("telegram.posts.editor.moving"),
                  current: 0,
                  total: 1,
                });
                try {
                  const response = await telegramChannelsApi.moveManagedPost(
                    sourceChannelId,
                    post.id,
                    targetId,
                  );
                  setProgress({
                    title: t("telegram.posts.editor.moving"),
                    current: 1,
                    total: 1,
                    item: response.results[0],
                    result: response,
                  });
                  await onMoved(response, targetId);
                  window.setTimeout(() => setProgress(null), 2200);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("telegram.posts.editor.movePost")}
            </Button>
          </div>
        </div>
      </Modal>
      <BulkProgressOverlay progress={progress} />
    </>
  );
}
