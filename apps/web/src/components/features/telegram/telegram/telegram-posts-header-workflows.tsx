"use client";

import { useState } from "react";
import { Bot, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import { Button, CustomSelect, PageHeader } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import { telegramPostKeys } from "@/lib/query-keys";
import { ManagedPostsImportModal } from "./managed-posts-import-modal";
import { PostGroupsImportModal } from "./post-groups-import-modal";
import { ChannelReimportDeleteModal } from "./channel-reimport-delete-modal";
import { GptContextDownloadButton } from "./gpt-context-download-button";
import { ResetChannelScheduledPostsButton } from "./reset-channel-scheduled-posts-button";
import type { ChannelImportMode } from "./channel-import-navigation";
import { PostFromBotModal } from "./post-from-bot/post-from-bot-modal";
import { UnifiedImportModal } from "./unified-import-modal";

export function TelegramPostsHeaderWorkflows({
  channel,
  channels,
  importMode,
  importTranslationsReady,
  onChannelChange,
  onImportModeChange,
  onResetCompleted,
}: {
  channel?: TelegramChannelSelectOption;
  channels: TelegramChannelSelectOption[];
  importMode: ChannelImportMode | null;
  importTranslationsReady: boolean;
  onChannelChange: (channelId: string) => void;
  onImportModeChange: (mode: ChannelImportMode | null) => void;
  onResetCompleted: () => void;
}) {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [postFromBotOpen, setPostFromBotOpen] = useState(false);
  const activeChannel = channel ?? channels[0];

  return (
    <>
      <PageHeader
        title={t("telegram.posts.title")}
        subtitle={t("telegram.posts.subtitle")}
        action={
          activeChannel ? (
            <div className="flex w-full flex-wrap justify-end gap-2 sm:min-w-[720px]">
              <div className="min-w-[260px] flex-1 [&>div>button]:h-[42px] [&>div>button]:min-h-0">
                <CustomSelect
                  uiLocale={locale}
                  value={activeChannel.id}
                  onChange={onChannelChange}
                  options={channels.map((item) => ({
                    value: item.id,
                    label: item.title,
                    iconUrl: item.photoUrl || undefined,
                    iconFallback: item.title,
                  }))}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-[42px] shrink-0"
                onClick={() => onImportModeChange("unified")}
              >
                <Upload size={17} /> {t("common.import")}
              </Button>
              <Button
                type="button"
                className="h-[42px] shrink-0"
                onClick={() => setPostFromBotOpen(true)}
              >
                <Bot size={17} /> {t("telegram.posts.batch.addViaBot")}
              </Button>
              <GptContextDownloadButton
                channelId={activeChannel.id}
                channelTitle={activeChannel.title}
              />
              <ResetChannelScheduledPostsButton
                channelId={activeChannel.id}
                channelTitle={activeChannel.title}
                onCompleted={onResetCompleted}
              />
            </div>
          ) : undefined
        }
      />

      {activeChannel && importTranslationsReady ? (
        <UnifiedImportModal
          open={importMode === "unified"}
          channelId={activeChannel.id}
          channelTitle={activeChannel.title}
          channelPhotoUrl={activeChannel.photoUrl}
          channelTelegramChatId={activeChannel.telegramChatId}
          captionLengthMax={activeChannel.publishingCapabilities.captionLengthMax}
          messageLengthMax={activeChannel.publishingCapabilities.messageLengthMax}
          onClose={() => onImportModeChange(null)}
          onApplied={async () => {
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.managedLists(activeChannel.id),
              }),
              queryClient.invalidateQueries({
                queryKey: telegramPostKeys.postGroups(activeChannel.id),
              }),
            ]);
          }}
        />
      ) : null}
      {activeChannel && importTranslationsReady ? (
        <ManagedPostsImportModal
          open={importMode === "posts"}
          onClose={() => onImportModeChange(null)}
          channelId={activeChannel.id}
          channelTitle={activeChannel.title}
          channelPhotoUrl={activeChannel.photoUrl}
          channelTelegramChatId={activeChannel.telegramChatId}
          captionLengthMax={
            activeChannel.publishingCapabilities.captionLengthMax
          }
          messageLengthMax={
            activeChannel.publishingCapabilities.messageLengthMax
          }
          mode="posts"
          onModeChange={onImportModeChange}
        />
      ) : null}
      {activeChannel && importTranslationsReady ? (
        <PostGroupsImportModal
          open={importMode === "groups"}
          channelId={activeChannel.id}
          onClose={() => onImportModeChange(null)}
          mode="groups"
          onModeChange={onImportModeChange}
          onImported={async () => {
            await queryClient.invalidateQueries({
              queryKey: telegramPostKeys.postGroups(activeChannel.id),
            });
          }}
        />
      ) : null}
      {activeChannel && importTranslationsReady ? (
        <ChannelReimportDeleteModal
          open={importMode === "reimport"}
          channelId={activeChannel.id}
          mode="reimport"
          onModeChange={onImportModeChange}
          onClose={() => onImportModeChange(null)}
        />
      ) : null}
      <PostFromBotModal
        key={activeChannel?.id ?? "mass-publications"}
        open={postFromBotOpen}
        channels={channels}
        defaultChannelId={activeChannel?.id}
        onClose={() => setPostFromBotOpen(false)}
      />
    </>
  );
}
