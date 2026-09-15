"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import {
  normalizeTelegramPostMediaItems,
  telegramPostPhotoUrls,
  type TelegramPostButtonRows,
  type TelegramPostMediaItem,
  type ResolvedEmoji,
  type TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import {
  iconsApi,
  telegramSystemBotApi,
  type Icon,
  type Promo,
  type TelegramChannel,
  type TelegramInviteLink,
} from "@/lib/api";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { IconPicker } from "@/components/icons/icon-picker";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import { TelegramPostMediaUpload } from "@/components/features/telegram/telegram/telegram-post-media-upload";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import {
  telegramInviteLinkDefaultBadgeClassName,
  telegramInviteLinkOptionLabel,
} from "@/lib/features/telegram/telegram-invite-link-options";
import {
  Button,
  Card,
  CustomSelect,
  FormError,
  FormField,
  Input,
  Modal,
} from "@/components/ui/primitives";
import { emojiIcons } from "@/lib/emoji-icons";
import { iconToResolvedEmoji } from "@/lib/resolved-emoji";
import {
  extractAutoPrefilledPostTitle,
  extractFirstEmoji,
} from "@/lib/features/telegram/telegram-post-title";
import { useTelegramInviteLinkOptions } from "@/lib/features/telegram/use-telegram-invite-link-options";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import {
  useWorkspaceModalDrafts,
  type WorkspaceFormDraft,
} from "@/hooks/use-workspace-modal-drafts";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import {
  PROMO_INVITE_LINK_TOKEN,
  promoContainsInviteToken,
  renderPromoInviteLink,
  type ReusablePromoPost,
} from "./promo-invite-template";
import { PromoPostEditorSection } from "./promo-post-editor-section";

export type PromoFormPayload = {
  telegramChannelId: string;
  assignedMemberId?: string | null;
  iconId?: string | null;
  title: string;
  text: string;
  plainText?: string | null;
  formattedHtml?: string | null;
  imageData?: string;
  imageUrls: string[];
  mediaItems: TelegramPostMediaItem[];
  buttonRows: TelegramPostButtonRows;
  defaultInviteLinkId?: string | null;
};

const emptyPost = (): ReusablePromoPost => ({
  text: "",
  imageUrls: [],
  mediaItems: [],
  buttonRows: [],
});

function postFromPromo(promo?: Promo): ReusablePromoPost {
  const imageUrls = promo?.imageUrls?.length
    ? promo.imageUrls
    : promo?.imageData
      ? [promo.imageData]
      : [];
  return promo
    ? {
        text: promo.text ?? "",
        plainText: promo.plainText,
        formattedHtml: promo.formattedHtml,
        imageUrls,
        mediaItems: normalizeTelegramPostMediaItems(
          promo.mediaItems,
          imageUrls,
        ),
        buttonRows: promo.buttonRows ?? [],
      }
    : emptyPost();
}

function hasPromoPostContent(post: ReusablePromoPost) {
  return Boolean(
    post.text.trim() ||
    post.imageUrls.length ||
    post.mediaItems?.length ||
    post.buttonRows.length,
  );
}

type PromoModalDraft = {
  iconId: string | null;
  assignedMemberId: string | null;
  channelId: string;
  inviteLinkId: string;
  title: string;
  post: ReusablePromoPost;
};

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
      icon:
        draftIconPresentation ??
        iconToResolvedEmoji(autoIcon) ??
        (iconId === initial?.iconId
          ? iconToResolvedEmoji(initial?.icon)
          : null),
    }),
    [autoIcon, draftIconPresentation, iconId, initial?.icon, initial?.iconId],
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
  const emptyDraft = useCallback<() => PromoModalDraft>(
    () => ({
      iconId: null,
      assignedMemberId: null,
      channelId: "",
      inviteLinkId: "",
      title: "",
      post: emptyPost(),
    }),
    [],
  );
  const isMeaningfulDraft = useCallback(
    (draft: PromoModalDraft) =>
      Boolean(
        draft.title.trim() ||
        draft.iconId ||
        draft.post.text.trim() ||
        draft.post.imageUrls.length ||
        draft.post.mediaItems?.length ||
        draft.post.buttonRows.length,
      ),
    [],
  );
  const drafts = useWorkspaceModalDrafts({
    namespace: "ads:promo:draft",
    open,
    enabled: !initial,
    value: draftValue,
    preview: draftPreview,
    emptyValue: emptyDraft,
    onRestore: restoreDraft,
    isMeaningful: isMeaningfulDraft,
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
    enabled: open,
    seedLinks: initial?.defaultInviteLink ? [initial.defaultInviteLink] : [],
  });
  const inviteLinks = inviteLinkOptions.links;
  const selectedInvite =
    inviteLinks.find((link) => link.id === inviteLinkId) ??
    initial?.defaultInviteLink;
  const renderedPost = selectedInvite?.url
    ? renderPromoInviteLink(post, selectedInvite.url)
    : post;

  const botFlow = useTelegramSystemBotPostFlow<TelegramSystemBotPostDraft>({
    botUsername: connectionQuery.data?.botUsername,
    prepareImport: async () =>
      (await telegramSystemBotApi.preparePromoPostImport()).workflowId,
    readImport: async (workflowId) => {
      const result =
        await telegramSystemBotApi.promoPostImportResult(workflowId);
      return result.ready
        ? { ready: true as const, value: result.draft }
        : { ready: false as const };
    },
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
    sendPreview: async () => {
      if (!selectedInvite?.url && promoContainsInviteToken(post)) {
        throw new Error("Invite link is required");
      }
      await telegramSystemBotApi.sendPromoPostPreview({
        title: titleValue.trim() || "Promo",
        ...renderedPost,
        plainText: renderedPost.plainText ?? undefined,
        formattedHtml: renderedPost.formattedHtml ?? undefined,
      });
    },
    importErrorMessage:
      "Could not load the forwarded promo from the bot. Finish any active import and try again.",
    sendErrorMessage: "Could not send the promo to the system bot.",
  });
  const resetBotFlow = botFlow.reset;

  useEffect(() => {
    if (!open) resetBotFlow();
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
        defaultInviteLinkId: inviteLinkId || null,
      });
      drafts.clearCurrentDraft();
    } catch {
      setError("Could not save the promo. Your draft is still available.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {!initial && drafts.pendingDrafts.length ? (
        <ModalDraftPicker
          drafts={drafts.pendingDrafts}
          titleFor={(draft) => draft.title.trim() || "Unfinished promo"}
          iconIdFor={(draft) => draft.iconId}
          onContinue={(draft) => {
            drafts.continueDraft(draft);
            setPostEditorExpanded(false);
          }}
          onDelete={drafts.deleteDraft}
          onCreateNew={() => {
            drafts.createNewDraft();
            setPostEditorExpanded(false);
          }}
        />
      ) : (
        <Card className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(220px,.85fr)]">
            <FormField label="Emoji">
              <IconPicker
                compact
                iconId={iconId}
                icon={
                  draftIconPresentation ??
                  autoIcon ??
                  (iconId === initial?.iconId ? initial.icon : null)
                }
                onChange={(value, presentation) => {
                  manualIconRef.current = true;
                  setAutoIcon(null);
                  setDraftIconPresentation(presentation ?? null);
                  setIconId(value);
                }}
                buttonLabel="Add emoji"
              />
            </FormField>
            <FormField label="Internal title" required>
              <Input
                value={titleValue}
                onChange={(event) => setTitleValue(event.target.value)}
                placeholder="Promo title"
              />
            </FormField>
            <FormField label="Channel" required>
              <CustomSelect
                value={channelId}
                onChange={(value) => {
                  setChannelId(value);
                  setInviteLinkId("");
                }}
                placeholder="Select channel"
                options={channels.map((channel) => ({
                  value: channel.id,
                  label: channel.title,
                  iconUrl: channel.photoUrl,
                  iconFallback: channel.title,
                }))}
              />
            </FormField>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Member">
              <MemberSelect
                value={assignedMemberId}
                onChange={(value) => setAssignedMemberId(value || null)}
                defaultToCurrent={!initial}
              />
            </FormField>
            <FormField label="Invite link">
              <CustomSelect
                value={inviteLinkId}
                onChange={setInviteLinkId}
                disabled={!channelId}
                onOpen={inviteLinkOptions.requestAll}
                loading={inviteLinkOptions.loading}
                loadingLabel="Loading invite links…"
                placeholder="Select invite link"
                options={inviteLinks.map((link: TelegramInviteLink) => ({
                  value: link.id,
                  label: telegramInviteLinkOptionLabel(link),
                  badgeClassName: telegramInviteLinkDefaultBadgeClassName(link),
                  meta: link.url,
                  iconFallback: inviteLinkCreatorFallback(link),
                  icon: (
                    <TelegramInviteLinkCreatorAvatar
                      photoUrl={link.creatorPhotoUrl}
                      memberAvatar={link.creatorMember?.avatarPresentation}
                      label={inviteLinkCreatorFallback(link)}
                    />
                  ),
                }))}
              />
            </FormField>
          </div>
          <PromoPostEditorSection
            expanded={postEditorExpanded}
            hasContent={hasPromoPostContent(post)}
            connected={Boolean(connectionQuery.data?.connected)}
            connectionLoading={connectionQuery.isLoading}
            importStatus={botFlow.importStatus}
            dots={botFlow.dots}
            error={botFlow.error || undefined}
            onImport={() => void startBotImport()}
            onToggleEditor={() =>
              setPostEditorExpanded((expanded) => !expanded)
            }
          >
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(240px,.62fr)_minmax(0,1.38fr)]">
              <TelegramPostPreview
                channelTitle={selectedChannel?.title || "Telegram channel"}
                channelPhotoUrl={selectedChannel?.photoUrl}
                text={renderedPost.text}
                plainText={renderedPost.plainText}
                formattedHtml={renderedPost.formattedHtml}
                imageUrls={renderedPost.imageUrls}
                mediaItems={renderedPost.mediaItems}
                buttonRows={renderedPost.buttonRows}
                onTextChange={(text) =>
                  setPost((current) => ({
                    ...current,
                    text: selectedInvite?.url
                      ? text
                          .split(selectedInvite.url)
                          .join(PROMO_INVITE_LINK_TOKEN)
                      : text,
                    plainText: undefined,
                    formattedHtml: undefined,
                  }))
                }
              />
              <div className="space-y-3">
                <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 p-3 text-xs text-blue-100">
                  Use <code>{PROMO_INVITE_LINK_TOKEN}</code> in text or button
                  URLs. The selected invite link is inserted only when the promo
                  is sent.
                </div>
                <FormField label="Promo text">
                  <TelegramTextEditor
                    value={post.text}
                    onChange={(text) =>
                      setPost((current) => ({
                        ...current,
                        text,
                        plainText: undefined,
                        formattedHtml: undefined,
                      }))
                    }
                    rows={12}
                    channelId={channelId || undefined}
                    enableCustomEmoji
                    buttonRows={post.buttonRows}
                    onButtonRowsChange={(buttonRows) =>
                      setPost((current) => ({ ...current, buttonRows }))
                    }
                    placeholder="Write the reusable Telegram promo…"
                  />
                </FormField>
                <TelegramPostMediaUpload
                  value={normalizeTelegramPostMediaItems(
                    post.mediaItems,
                    post.imageUrls,
                  )}
                  onChange={(mediaItems) =>
                    setPost((current) => ({
                      ...current,
                      mediaItems,
                      imageUrls: telegramPostPhotoUrls(mediaItems),
                    }))
                  }
                  compact
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void sendToBot()}
                  disabled={
                    !connectionQuery.data?.connected ||
                    botFlow.sendStatus === "working" ||
                    !hasPromoPostContent(post)
                  }
                >
                  <Send size={15} />{" "}
                  {botFlow.sendStatus === "working"
                    ? "Sending…"
                    : botFlow.sendStatus === "done"
                      ? "✅ Sent to bot"
                      : "Send promo to bot"}
                </Button>
              </div>
            </div>
          </PromoPostEditorSection>
          {error ? <FormError message={error} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!channelId || !titleValue.trim()}
              onClick={submit}
            >
              {initial ? "Save promo" : "Create promo"}
            </Button>
          </div>
        </Card>
      )}
    </Modal>
  );
}
