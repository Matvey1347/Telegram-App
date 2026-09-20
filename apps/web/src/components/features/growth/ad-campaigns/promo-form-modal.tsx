"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  normalizeTelegramPostMediaItems,
  telegramPostPhotoUrls,
  type ResolvedEmoji,
} from "@telegram-system/shared";
import {
  iconsApi,
  telegramSystemBotApi,
  type Icon,
  type Promo,
  type TelegramChannel,
} from "@/lib/api";
import { emojiIcons } from "@/lib/emoji-icons";
import { iconToResolvedEmoji } from "@/lib/resolved-emoji";
import {
  extractAutoPrefilledPostTitle,
  extractFirstEmoji,
} from "@/lib/features/telegram/telegram-post-title";
import { useTelegramInviteLinkOptions } from "@/lib/features/telegram/use-telegram-invite-link-options";
import { useRegisterTelegramInviteLink } from "@/lib/features/telegram/use-register-telegram-invite-link";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import {
  useWorkspaceModalDrafts,
  type WorkspaceFormDraft,
} from "@/hooks/use-workspace-modal-drafts";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import {
  PROMO_INVITE_LINK_TOKEN,
  promoContainsInviteToken,
  replacePromoInviteLinksWithToken,
  replacePromoTelegramLinksWithToken,
  renderPromoInviteLink,
  type ReusablePromoPost,
} from "./promo-invite-template";
import { PromoFormView } from "./promo-form-view";

import {
  emptyPromoPost as emptyPost,
  emptyPromoModalDraft,
  isMeaningfulPromoModalDraft,
  normalizePromoModalDraft,
  postFromPromo,
  type PromoFormPayload,
  type PromoModalDraft,
} from "./promo-form-model";

export type { PromoFormPayload } from "./promo-form-model";

export function PromoFormModal({
  open,
  onClose,
  onSubmit,
  title,
  initial,
  channels,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: PromoFormPayload) => void | Promise<void>;
  title: string;
  initial?: Promo;
  channels: TelegramChannel[];
}) {
  const [iconId, setIconId] = useState<string | null>(null);
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState("");
  const [inviteLinkId, setInviteLinkId] = useState("");
  const [titleValue, setTitleValue] = useState("");
  const [post, setPost] = useState<ReusablePromoPost>(emptyPost);
  const [error, setError] = useState("");
  const [postEditorExpanded, setPostEditorExpanded] = useState(false);
  const [autoIcon, setAutoIcon] = useState<Icon | null>(null);
  const [draftIconPresentation, setDraftIconPresentation] =
    useState<ResolvedEmoji | null>(null);
  const manualIconRef = useRef(false);
  const requestedEmojiRef = useRef("");

  useEffect(() => {
    if (!open) return;
    // A controlled modal is reset only when a new open/edit session starts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIconId(initial?.iconId ?? null);
    setAutoIcon(null);
    setDraftIconPresentation(null);
    manualIconRef.current = false;
    requestedEmojiRef.current = "";
    setAssignedMemberId(
      initial?.assignedMemberId ?? initial?.assignedMember?.id ?? null,
    );
    setChannelId(initial?.telegramChannelId ?? "");
    setInviteLinkId(initial?.defaultInviteLinkId ?? "");
    setTitleValue(initial?.title ?? "");
    setPost(postFromPromo(initial));
    setPostEditorExpanded(false);
    setError("");
  }, [initial, open]);

  const draftValue = useMemo<PromoModalDraft>(
    () => ({
      iconId,
      assignedMemberId,
      channelId,
      inviteLinkId,
      title: titleValue,
      post,
    }),
    [assignedMemberId, channelId, iconId, inviteLinkId, post, titleValue],
  );
  const draftPreview = useMemo(
    () => ({
      title: titleValue || "Untitled promo",
      icon:
        draftIconPresentation ??
        iconToResolvedEmoji(autoIcon) ??
        (iconId === initial?.iconId
          ? iconToResolvedEmoji(initial?.icon)
          : null),
    }),
    [
      autoIcon,
      draftIconPresentation,
      iconId,
      initial?.icon,
      initial?.iconId,
      titleValue,
    ],
  );
  const restoreDraft = useCallback(
    (
      draft: PromoModalDraft,
      storedDraft?: WorkspaceFormDraft<PromoModalDraft>,
    ) => {
      setIconId(draft.iconId ?? null);
      setAutoIcon(null);
      setDraftIconPresentation(storedDraft?.preview?.icon ?? null);
      manualIconRef.current = Boolean(draft.iconId);
      setAssignedMemberId(draft.assignedMemberId);
      setChannelId(draft.channelId);
      setInviteLinkId(draft.inviteLinkId);
      setTitleValue(draft.title);
      setPost(draft.post);
      setError("");
    },
    [],
  );
  const drafts = useWorkspaceModalDrafts<PromoModalDraft>({
    namespace: "ads:promo:draft",
    workspaceId: selectedWorkspaceDraftScope(),
    schemaVersion: 1,
    open,
    enabled: !initial,
    value: draftValue,
    preview: draftPreview,
    createInitialValue: emptyPromoModalDraft,
    normalize: normalizePromoModalDraft,
    onRestore: restoreDraft,
    isMeaningful: isMeaningfulPromoModalDraft,
  });

  const connectionQuery = useQuery({
    queryKey: ["telegram-system-bot", "connection"],
    queryFn: telegramSystemBotApi.connection,
    enabled: open,
    staleTime: 30_000,
  });
  const selectedChannel = channels.find((channel) => channel.id === channelId);
  const inviteLinkOptions = useTelegramInviteLinkOptions({
    channelId,
    selectedId:
      inviteLinkId || selectedChannel?.mutualPromotionInviteLinkIds?.[0],
    seedLinks: initial?.defaultInviteLink ? [initial.defaultInviteLink] : [],
    enabled: open,
  });
  const inviteLinks = inviteLinkOptions.links;
  const registerInviteLink = useRegisterTelegramInviteLink({
    channelId,
    onRegistered: (link) => setInviteLinkId(link.id),
  });
  const selectedInvite = inviteLinks.find((link) => link.id === inviteLinkId);
  const postWithReusableLink = initial?.defaultInviteLink?.url
    ? replacePromoInviteLinksWithToken(post, [initial.defaultInviteLink.url])
    : post;
  const renderedPost = selectedInvite?.url
    ? renderPromoInviteLink(postWithReusableLink, selectedInvite.url)
    : postWithReusableLink;

  const botFlow = useTelegramSystemBotPostFlow({
    mode: "single",
    recoveryKey: "promo-form",
    importContext: "Promo",
    workspaceId: connectionQuery.data?.currentWorkspaceId,
    botUsername: connectionQuery.data?.botUsername,
    enabled: open,
    onImported: async (draft) => {
      const importedTitle =
        extractAutoPrefilledPostTitle(draft.title)?.title ?? draft.title.trim();
      setTitleValue((current) => current.trim() || importedTitle);
      setPost({
        text: draft.text,
        plainText: draft.plainText,
        formattedHtml: draft.formattedHtml,
        imageUrls: draft.imageUrls,
        mediaItems: normalizeTelegramPostMediaItems(
          draft.mediaItems,
          draft.imageUrls,
        ),
        buttonRows: draft.buttonRows,
      });
      setPostEditorExpanded(true);
      const importedEmoji = extractFirstEmoji(draft.text);
      if (importedEmoji && !manualIconRef.current && !iconId) {
        requestedEmojiRef.current = importedEmoji;
        const catalog = emojiIcons.find((item) => item.emoji === importedEmoji);
        const icon = await iconsApi.createEmoji({
          emoji: importedEmoji,
          name: catalog?.name ?? `Promo ${importedEmoji}`,
        });
        if (!manualIconRef.current) {
          setAutoIcon(icon);
          setIconId(icon.id);
        }
      }
    },
    previewDraft:
      !selectedInvite?.url && promoContainsInviteToken(postWithReusableLink)
        ? null
        : {
            title: titleValue.trim() || "Promo",
            ...renderedPost,
            plainText: renderedPost.plainText ?? undefined,
            formattedHtml: renderedPost.formattedHtml ?? undefined,
          },
    errorCopy: {
      read: "Could not load the forwarded promo from the bot. Finish any active import and try again.",
      preview: "Could not send the promo to the system bot.",
    },
  });
  const resetBotFlow = botFlow.reset;

  useEffect(() => {
    if (!open) void resetBotFlow();
  }, [open, resetBotFlow]);

  useEffect(() => {
    if (!open || inviteLinkId || !inviteLinkOptions.initialLink) return;
    // Select the channel's default without loading the rest of its links.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInviteLinkId(inviteLinkOptions.initialLink.id);
  }, [inviteLinkId, inviteLinkOptions.initialLink, open]);

  const firstPostEmoji = extractFirstEmoji(post.text);
  const { mutate: createAutoEmoji } = useMutation({
    mutationFn: (emoji: string) => {
      const catalog = emojiIcons.find((item) => item.emoji === emoji);
      return iconsApi.createEmoji({
        emoji,
        name: catalog?.name ?? `Promo ${emoji}`,
      });
    },
    onSuccess: (icon) => {
      if (manualIconRef.current) return;
      setAutoIcon(icon);
      setIconId(icon.id);
    },
  });
  useEffect(() => {
    if (
      !open ||
      iconId ||
      manualIconRef.current ||
      !firstPostEmoji ||
      requestedEmojiRef.current === firstPostEmoji
    )
      return;
    requestedEmojiRef.current = firstPostEmoji;
    createAutoEmoji(firstPostEmoji);
  }, [createAutoEmoji, firstPostEmoji, iconId, open]);

  const sendToBot = async () => {
    if (!selectedInvite?.url && promoContainsInviteToken(post)) {
      setError("Select an invite link before sending this reusable promo.");
      return;
    }
    setError("");
    await botFlow.send();
  };

  const startBotImport = async () => {
    await botFlow.startImport();
  };

  const submit = async () => {
    if (!channelId || !titleValue.trim()) return;
    if (inviteLinkId && !selectedInvite) {
      setError(
        "The selected invite link is no longer available for this channel. Choose a current link.",
      );
      return;
    }
    const mediaItems = normalizeTelegramPostMediaItems(
      post.mediaItems,
      post.imageUrls,
    );
    try {
      await onSubmit({
        telegramChannelId: channelId,
        assignedMemberId,
        iconId,
        title: titleValue.trim(),
        text: post.text,
        plainText: post.plainText,
        formattedHtml: post.formattedHtml,
        imageData: telegramPostPhotoUrls(mediaItems)[0],
        imageUrls: telegramPostPhotoUrls(mediaItems),
        mediaItems,
        buttonRows: post.buttonRows,
        defaultInviteLinkId: selectedInvite?.id ?? null,
      });
      drafts.clearCurrentDraft();
    } catch {
      setError("Could not save the promo. Your draft is still available.");
    }
  };

  return (
    <PromoFormView
      open={open}
      modalTitle={title}
      initial={initial}
      channels={channels}
      pendingDrafts={drafts.pendingDrafts}
      iconId={iconId}
      icon={
        draftIconPresentation ??
        autoIcon ??
        (iconId === initial?.iconId ? (initial.icon ?? null) : null)
      }
      assignedMemberId={assignedMemberId}
      channelId={channelId}
      inviteLinkId={inviteLinkId}
      inviteLinks={inviteLinks}
      inviteLinksLoading={inviteLinkOptions.loading}
      post={post}
      renderedPost={renderedPost}
      selectedChannel={selectedChannel}
      selectedInvite={selectedInvite ?? undefined}
      postEditorExpanded={postEditorExpanded}
      botConnected={Boolean(connectionQuery.data?.connected)}
      botConnectionLoading={connectionQuery.isLoading}
      importStatus={botFlow.importStatus}
      sendStatus={botFlow.sendStatus}
      dots={botFlow.dots}
      botError={botFlow.error || undefined}
      error={error}
      titleValue={titleValue}
      onClose={onClose}
      onContinueDraft={(draft) => {
        drafts.continueDraft(draft);
        setPostEditorExpanded(false);
      }}
      onDeleteDraft={drafts.deleteDraft}
      onCreateDraft={() => {
        drafts.createNewDraft();
        setPostEditorExpanded(false);
      }}
      onIconChange={(value, presentation) => {
        manualIconRef.current = true;
        setAutoIcon(null);
        setDraftIconPresentation(presentation ?? null);
        setIconId(value);
      }}
      onTitleChange={setTitleValue}
      onChannelChange={(value) => {
        setChannelId(value);
        setInviteLinkId("");
      }}
      onMemberChange={(value) => setAssignedMemberId(value || null)}
      onInviteLinkChange={setInviteLinkId}
      onRequestInviteLinks={inviteLinkOptions.requestAll}
      onRegisterInviteLink={async (url) => {
        await registerInviteLink.mutateAsync(url);
      }}
      onToggleEditor={() => setPostEditorExpanded((expanded) => !expanded)}
      onImport={() => void startBotImport()}
      onPreviewTextChange={(text) =>
        setPost((current) => ({
          ...current,
          text: selectedInvite?.url
            ? text.split(selectedInvite.url).join(PROMO_INVITE_LINK_TOKEN)
            : text,
          plainText: undefined,
          formattedHtml: undefined,
        }))
      }
      onPostChange={setPost}
      onReplaceTelegramLinks={() =>
        setPost((current) => replacePromoTelegramLinksWithToken(current))
      }
      onSend={() => void sendToBot()}
      onSubmit={() => void submit()}
    />
  );
}
