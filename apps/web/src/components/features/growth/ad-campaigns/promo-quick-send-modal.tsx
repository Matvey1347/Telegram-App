"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { promosApi, telegramSystemBotApi, type Promo } from "@/lib/api";
import { telegramSystemBotKeys } from "@/lib/query-keys";
import { useTelegramInviteLinkOptions } from "@/lib/features/telegram/use-telegram-invite-link-options";
import { useTelegramSystemBotPostFlow } from "@/hooks/use-telegram-system-bot-post-flow";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import {
  isTelegramInviteLink,
  telegramInviteLinkOptionLabel,
} from "@/lib/features/telegram/telegram-invite-link-options";
import { TelegramInviteLinkOptionLabel } from "@/components/features/telegram/telegram/telegram-invite-link-option-label";
import { useRegisterTelegramInviteLink } from "@/lib/features/telegram/use-register-telegram-invite-link";
import {
  Button,
  CustomSelect,
  FormError,
  FormField,
  Modal,
} from "@/components/ui/primitives";
import { featureModalIcon } from "@/components/ui/feature-modal-icons";
import { hasPromoPostContent, postFromPromo } from "./promo-form-model";
import {
  replacePromoInviteLinksWithToken,
  renderPromoInviteLink,
} from "./promo-invite-template";

export function PromoQuickSendModal({
  promo,
  onClose,
}: {
  promo: Promo;
  onClose: () => void;
}) {
  const [inviteLinkId, setInviteLinkId] = useState("");
  // Promo cards contain a compact list read model, not the post or saved link.
  const detail = useQuery({
    queryKey: ["promos", "detail", promo.id],
    queryFn: () => promosApi.get(promo.id),
  });
  const currentPromo = detail.data;
  const connection = useQuery({
    queryKey: telegramSystemBotKeys.connection(),
    queryFn: telegramSystemBotApi.connection,
    staleTime: 30_000,
  });
  const inviteOptions = useTelegramInviteLinkOptions({
    channelId: currentPromo?.telegramChannelId,
    selectedId: inviteLinkId || currentPromo?.defaultInviteLinkId,
    seedLinks: currentPromo?.defaultInviteLink
      ? [currentPromo.defaultInviteLink]
      : [],
    enabled: Boolean(currentPromo),
  });
  const registerLink = useRegisterTelegramInviteLink({
    channelId: currentPromo?.telegramChannelId ?? promo.telegramChannelId,
    onRegistered: (link) => setInviteLinkId(link.id),
  });
  const resolvingLink =
    detail.isLoading || Boolean(currentPromo && inviteOptions.initialLoading);
  const preferredLinkId = inviteLinkId || currentPromo?.defaultInviteLinkId;
  const selectedLink = resolvingLink
    ? undefined
    : inviteOptions.links.find(
        (link) =>
          link.id === (preferredLinkId || inviteOptions.initialLink?.id),
      );
  const post = postFromPromo(currentPromo);
  const reusablePost = currentPromo?.defaultInviteLink?.url
    ? replacePromoInviteLinksWithToken(post, [
        currentPromo.defaultInviteLink.url,
      ])
    : post;
  const renderedPost = selectedLink?.url
    ? renderPromoInviteLink(reusablePost, selectedLink.url)
    : reusablePost;
  const flow = useTelegramSystemBotPostFlow({
    mode: "single",
    recoveryKey: "promo-quick-send",
    workspaceId: connection.data?.currentWorkspaceId,
    botUsername: connection.data?.botUsername,
    previewDraft: selectedLink?.url
      ? {
          title: currentPromo?.title ?? promo.title,
          ...renderedPost,
          plainText: renderedPost.plainText ?? undefined,
          formattedHtml: renderedPost.formattedHtml ?? undefined,
        }
      : null,
    errorCopy: { preview: "Could not send the promo to the system bot." },
  });
  const canSend = Boolean(
    currentPromo &&
    connection.data?.connected &&
    selectedLink?.url &&
    hasPromoPostContent(post) &&
    flow.sendStatus !== "working",
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Send promo to bot"
      titleIcon={featureModalIcon("promo")}
      size="sm"
    >
      <div className="min-w-0 space-y-4">
        <p className="max-h-32 overflow-y-auto break-words rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 text-sm leading-5 text-neutral-300">
          {promo.title}
        </p>
        {detail.isLoading ? (
          <p className="text-xs text-neutral-400">Loading promo post…</p>
        ) : null}
        {detail.isError ? (
          <FormError message="Could not load the promo post." />
        ) : null}
        <FormField label="Invite link" required>
          <CustomSelect
            value={selectedLink?.id ?? ""}
            onChange={setInviteLinkId}
            onOpen={inviteOptions.requestAll}
            disabled={resolvingLink || detail.isError || registerLink.isPending}
            loading={resolvingLink || inviteOptions.loading}
            loadingLabel="Loading invite link…"
            placeholder="Select invite link"
            options={(resolvingLink ? [] : inviteOptions.links).map((link) => ({
              value: link.id,
              label: telegramInviteLinkOptionLabel(link),
              labelContent: <TelegramInviteLinkOptionLabel link={link} />,
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
            canCreateOption={(input) =>
              isTelegramInviteLink(input) &&
              !inviteOptions.links.some((link) => link.url === input.trim())
            }
            createOptionLabel={() => "Verify and add this invite link"}
            onCreateOption={async (url) => {
              await registerLink.mutateAsync(url);
            }}
          />
        </FormField>
        {selectedLink?.url ? (
          <div className="min-w-0 space-y-1 text-xs text-neutral-400">
            <p>The bot will receive this link:</p>
            <p className="break-all text-sky-300">{selectedLink.url}</p>
          </div>
        ) : null}
        {inviteOptions.error ? (
          <FormError message="Could not load invite links." />
        ) : null}
        {connection.isError ? (
          <FormError message="Could not check the system bot connection." />
        ) : !connection.isLoading && !connection.data?.connected ? (
          <p className="text-xs text-amber-300">
            Connect the workspace system bot to send this promo.
          </p>
        ) : null}
        {!hasPromoPostContent(post) ? (
          <p className="text-xs text-amber-300">
            Add promo post content before sending it.
          </p>
        ) : null}
        {flow.error ? <FormError message={flow.error} /> : null}
        <div className="grid gap-2 sm:flex sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={!canSend}
            onClick={() => void flow.send()}
          >
            <Send size={15} />
            {flow.sendStatus === "working"
              ? "Sending…"
              : flow.sendStatus === "done"
                ? "✅ Sent to bot"
                : "Send to bot"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
