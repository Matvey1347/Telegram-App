"use client";

import { Link2, Send } from "lucide-react";
import type { ResolvedEmoji } from "@telegram-system/shared";
import type {
  Icon,
  Promo,
  TelegramChannel,
  TelegramInviteLink,
} from "@/lib/api";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { IconPicker } from "@/components/icons/icon-picker";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import { TelegramPostDraftEditor } from "@/components/features/telegram/telegram/telegram-post-draft-editor";
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
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { featureModalIcon } from "@/components/ui/feature-modal-icons";
import type { WorkspaceFormDraft } from "@/hooks/use-workspace-modal-drafts";
import {
  PROMO_INVITE_LINK_TOKEN,
  type ReusablePromoPost,
} from "./promo-invite-template";
import { hasPromoPostContent, type PromoModalDraft } from "./promo-form-model";
import { PromoPostEditorSection } from "./promo-post-editor-section";

type FlowStatus = "idle" | "working" | "waiting" | "done";

export function PromoFormView(props: {
  open: boolean;
  modalTitle: string;
  initial?: Promo;
  channels: TelegramChannel[];
  pendingDrafts: WorkspaceFormDraft<PromoModalDraft>[];
  iconId: string | null;
  icon: Icon | ResolvedEmoji | null;
  assignedMemberId: string | null;
  channelId: string;
  inviteLinkId: string;
  inviteLinks: TelegramInviteLink[];
  inviteLinksLoading: boolean;
  post: ReusablePromoPost;
  renderedPost: ReusablePromoPost;
  selectedChannel?: TelegramChannel;
  selectedInvite?: TelegramInviteLink;
  postEditorExpanded: boolean;
  botConnected: boolean;
  botConnectionLoading: boolean;
  importStatus: FlowStatus;
  sendStatus: FlowStatus;
  dots: number;
  botError?: string;
  error: string;
  onClose: () => void;
  onContinueDraft: (draft: WorkspaceFormDraft<PromoModalDraft>) => void;
  onDeleteDraft: (draft: WorkspaceFormDraft<PromoModalDraft>) => void;
  onCreateDraft: () => void;
  onIconChange: (
    id: string | null,
    presentation?: ResolvedEmoji | null,
  ) => void;
  onTitleChange: (value: string) => void;
  onChannelChange: (value: string) => void;
  onMemberChange: (value: string | null) => void;
  onInviteLinkChange: (value: string) => void;
  onRequestInviteLinks: () => void;
  onToggleEditor: () => void;
  onImport: () => void;
  onPreviewTextChange: (text: string) => void;
  onPostChange: (post: ReusablePromoPost) => void;
  onReplaceTelegramLinks: () => void;
  onSend: () => void;
  onSubmit: () => void;
  titleValue: string;
}) {
  const p = props;
  return (
    <Modal
      open={p.open}
      onClose={p.onClose}
      title={p.modalTitle}
      titleIcon={featureModalIcon("promo")}
      size="xl"
    >
      {!p.initial && p.pendingDrafts.length ? (
        <ModalDraftPicker
          drafts={p.pendingDrafts}
          titleFor={(draft) => draft.title.trim() || "Unfinished promo"}
          onContinue={p.onContinueDraft}
          onDelete={p.onDeleteDraft}
          onCreateNew={p.onCreateDraft}
        />
      ) : (
        <Card className="space-y-3">
          <div>
            <FormField label="Emoji">
              <IconPicker
                compact
                iconId={p.iconId}
                icon={p.icon}
                onChange={p.onIconChange}
                buttonLabel="Add emoji"
              />
            </FormField>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Internal title" required>
              <Input
                value={p.titleValue}
                onChange={(event) => p.onTitleChange(event.target.value)}
                placeholder="Promo title"
              />
            </FormField>
            <FormField label="Channel" required>
              <CustomSelect
                value={p.channelId}
                onChange={p.onChannelChange}
                placeholder="Select channel"
                options={p.channels.map((channel) => ({
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
                value={p.assignedMemberId}
                onChange={p.onMemberChange}
                defaultToCurrent={!p.initial}
              />
            </FormField>
            <FormField label="Invite link">
              <CustomSelect
                value={p.inviteLinkId}
                onChange={p.onInviteLinkChange}
                disabled={!p.channelId}
                onOpen={p.onRequestInviteLinks}
                loading={p.inviteLinksLoading}
                loadingLabel="Loading invite links…"
                placeholder="Select invite link"
                options={p.inviteLinks.map((link) => ({
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
            expanded={p.postEditorExpanded}
            hasContent={hasPromoPostContent(p.post)}
            connected={p.botConnected}
            connectionLoading={p.botConnectionLoading}
            importStatus={p.importStatus}
            dots={p.dots}
            error={p.botError}
            onImport={p.onImport}
            onToggleEditor={p.onToggleEditor}
          >
            <div className="space-y-3">
              <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 p-3 text-xs text-blue-100">
                Use <code>{PROMO_INVITE_LINK_TOKEN}</code> in text or button
                URLs. The selected invite link is inserted only when the promo
                is sent.
              </div>
              <TelegramPostDraftEditor
                draft={{
                  title: p.titleValue,
                  ...p.post,
                  plainText: p.post.plainText ?? undefined,
                  formattedHtml: p.post.formattedHtml ?? undefined,
                }}
                previewDraft={{
                  title: p.titleValue,
                  ...p.renderedPost,
                  plainText: p.renderedPost.plainText ?? undefined,
                  formattedHtml: p.renderedPost.formattedHtml ?? undefined,
                }}
                titleField="hidden"
                channelTitle={p.selectedChannel?.title || "Telegram channel"}
                channelPhotoUrl={p.selectedChannel?.photoUrl}
                channelId={p.channelId || undefined}
                onPreviewTextChange={p.onPreviewTextChange}
                onChange={(draft) => p.onPostChange(draft)}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={p.onReplaceTelegramLinks}
                  disabled={!hasPromoPostContent(p.post)}
                >
                  <Link2 size={15} /> Replace links with {"{{invite_link}}"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={p.onSend}
                  disabled={
                    !p.botConnected ||
                    p.sendStatus === "working" ||
                    !hasPromoPostContent(p.post)
                  }
                >
                  <Send size={15} />{" "}
                  {p.sendStatus === "working"
                    ? "Sending…"
                    : p.sendStatus === "done"
                      ? "✅ Sent to bot"
                      : "Send promo to bot"}
                </Button>
              </div>
            </div>
          </PromoPostEditorSection>
          {p.error ? <FormError message={p.error} /> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={p.onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!p.channelId || !p.titleValue.trim()}
              onClick={p.onSubmit}
            >
              {p.initial ? "Save promo" : "Create promo"}
            </Button>
          </div>
        </Card>
      )}
    </Modal>
  );
}
