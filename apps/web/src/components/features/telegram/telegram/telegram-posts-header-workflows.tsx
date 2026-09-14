"use client";

import { useState } from "react";
import { Bot, FolderPlus, Plus, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import { Button, CustomSelect, PageHeader } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import { telegramPostKeys } from "@/lib/query-keys";
import { ManagedPostsImportModal } from "./managed-posts-import-modal";
import { PostGroupsImportModal } from "./post-groups-import-modal";
import { ChannelReimportDeleteModal } from "./channel-reimport-delete-modal";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "./telegram-card-actions-menu";
import { TimePostsControl } from "./telegram-time-posts-control";
import { GptContextDownloadButton } from "./gpt-context-download-button";
import { ResetChannelScheduledPostsButton } from "./reset-channel-scheduled-posts-button";
import type { ChannelImportMode } from "./channel-import-navigation";
import { PostFromBotModal } from "./post-from-bot/post-from-bot-modal";

export function TelegramPostsHeaderWorkflows({
  channel,
  channels,
  workspaceView,
  importMode,
  importTranslationsReady,
  onChannelChange,
  onImportModeChange,
  onNewPost,
  onNewGroup,
  onResetCompleted,
}: {
  channel?: TelegramChannelSelectOption;
  channels: TelegramChannelSelectOption[];
  workspaceView: "posts" | "groups";
  importMode: ChannelImportMode | null;
  importTranslationsReady: boolean;
  onChannelChange: (channelId: string) => void;
  onImportModeChange: (mode: ChannelImportMode | null) => void;
  onNewPost: () => void;
  onNewGroup: () => void;
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
            <div className="flex w-full flex-col gap-2 sm:min-w-[720px] sm:flex-row">
              <div className="min-w-0 flex-1 [&>div>button]:h-[42px] [&>div>button]:min-h-0">
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
                className="h-[42px] shrink-0"
                onClick={() => setPostFromBotOpen(true)}
              >
                <Bot size={17} />
                {t("telegram.posts.batch.addViaBot")}
              </Button>
              <TelegramCardActionsMenu
                label={t("telegram.posts.channelActions")}
                keepMounted
                triggerClassName="!h-[42px] !w-[42px] shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
              >
                <TelegramCardMenuAction
                  label={t("common.import")}
                  icon={<Upload size={17} />}
                  onClick={() =>
                    onImportModeChange(
                      workspaceView === "groups" ? "groups" : "posts",
                    )
                  }
                />
                <TelegramCardMenuAction
                  label={t("telegram.posts.newPost")}
                  icon={<Plus size={17} />}
                  onClick={onNewPost}
                />
                <TelegramCardMenuAction
                  label={t("telegram.posts.newGroup")}
                  icon={<FolderPlus size={17} />}
                  onClick={onNewGroup}
                />
                <TimePostsControl
                  channelId={activeChannel.id}
                  timePosts={activeChannel.timePosts || []}
                  presentation="menu"
                />
                <GptContextDownloadButton
                  channelId={activeChannel.id}
                  channelTitle={activeChannel.title}
                  presentation="menu"
                />
                <ResetChannelScheduledPostsButton
                  channelId={activeChannel.id}
                  channelTitle={activeChannel.title}
                  presentation="menu"
                  onCompleted={onResetCompleted}
                />
              </TelegramCardActionsMenu>
            </div>
          ) : undefined
        }
      />

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
        open={postFromBotOpen}
        channels={channels}
        onClose={() => setPostFromBotOpen(false)}
      />
    </>
  );
}
