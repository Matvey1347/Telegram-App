"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TelegramChannel } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  Button,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import { telegramChannelKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import type { ChannelSettingsDraft } from "./channel-settings-draft";
import { useTelegramInviteLinkOptions } from "@/lib/features/telegram/use-telegram-invite-link-options";
import { useRegisterTelegramInviteLink } from "@/lib/features/telegram/use-register-telegram-invite-link";
import { ChannelInviteLinkSelectField } from "./channel-invite-link-select-field";

export function ChannelPresentationSettingsModal({
  channel,
  onClose,
  embedded = false,
  draft,
  onDraftChange,
  onRegisterPendingChange,
}: {
  channel: TelegramChannel;
  onClose: () => void;
  embedded?: boolean;
  draft?: ChannelSettingsDraft;
  onDraftChange?: (patch: Partial<ChannelSettingsDraft>) => void;
  onRegisterPendingChange?: (pending: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [localDraft, setLocalDraft] = useState({
    description: channel.shortDescription || "",
    tgStatUrl: channel.tgStatUrl || "",
    presentationIconId: channel.presentationIconId || "",
    defaultInviteLinkId: channel.defaultInviteLinkId || "",
    botInviteLinkId: channel.botInviteLinkId || "",
    broadcastInviteLinkId: channel.broadcastInviteLinkId || "",
    audienceTransferInviteLinkId: channel.audienceTransferInviteLinkId || "",
    folderDefaultInviteLinkIds: channel.folderDefaultInviteLinkIds ?? [],
    mutualPromotionInviteLinkIds: channel.mutualPromotionInviteLinkIds ?? [],
  });
  const values = draft ?? localDraft;
  const update = (patch: Partial<ChannelSettingsDraft>) => {
    if (onDraftChange) onDraftChange(patch);
    else setLocalDraft((current) => ({ ...current, ...patch }));
  };
  const linkOptions = useTelegramInviteLinkOptions({
    channelId: channel.id,
    selectedId: values.defaultInviteLinkId,
    selectedIds: [
      values.defaultInviteLinkId,
      values.botInviteLinkId,
      values.broadcastInviteLinkId,
      values.audienceTransferInviteLinkId,
      ...values.folderDefaultInviteLinkIds,
      ...values.mutualPromotionInviteLinkIds,
    ].filter(Boolean),
  });
  const hydratedPurposeLinksForChannel = useRef<string | null>(null);
  useEffect(() => {
    if (
      linkOptions.loading ||
      !linkOptions.links.length ||
      hydratedPurposeLinksForChannel.current === channel.id
    )
      return;
    hydratedPurposeLinksForChannel.current = channel.id;
    const patch: Partial<ChannelSettingsDraft> = {};
    const savedDefault = linkOptions.links.find(
      (link) => link.isDefaultForChannel,
    )?.id;
    const savedBot = linkOptions.links.find((link) => link.isDefaultForBot)?.id;
    const savedBroadcast = linkOptions.links.find(
      (link) => link.isDefaultForBroadcast,
    )?.id;
    const savedAudienceTransfer = linkOptions.links.find(
      (link) => link.isDefaultForAudienceTransfer,
    )?.id;
    const savedFolders = linkOptions.links
      .filter((link) => link.isDefaultForFolders)
      .map((link) => link.id);
    const savedMutualPromotion = linkOptions.links
      .filter((link) => link.isDefaultForMutualPromotion)
      .map((link) => link.id);
    if (!values.defaultInviteLinkId && savedDefault)
      patch.defaultInviteLinkId = savedDefault;
    if (!values.botInviteLinkId && savedBot) patch.botInviteLinkId = savedBot;
    if (!values.broadcastInviteLinkId && savedBroadcast)
      patch.broadcastInviteLinkId = savedBroadcast;
    if (!values.audienceTransferInviteLinkId && savedAudienceTransfer)
      patch.audienceTransferInviteLinkId = savedAudienceTransfer;
    if (!values.folderDefaultInviteLinkIds.length && savedFolders.length)
      patch.folderDefaultInviteLinkIds = savedFolders;
    if (
      !values.mutualPromotionInviteLinkIds.length &&
      savedMutualPromotion.length
    )
      patch.mutualPromotionInviteLinkIds = savedMutualPromotion;
    if (!Object.keys(patch).length) return;
    if (onDraftChange) onDraftChange(patch);
    // The query is the source of truth when a compact channel card omits its saved link roles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else setLocalDraft((current) => ({ ...current, ...patch }));
  }, [
    channel.id,
    linkOptions.links,
    linkOptions.loading,
    onDraftChange,
    values.botInviteLinkId,
    values.broadcastInviteLinkId,
    values.audienceTransferInviteLinkId,
    values.defaultInviteLinkId,
    values.folderDefaultInviteLinkIds.length,
    values.mutualPromotionInviteLinkIds.length,
  ]);
  const selectedInviteLinkId =
    values.defaultInviteLinkId || linkOptions.initialLink?.id || "";
  const links = useMemo(
    () =>
      linkOptions.links.map((link) => ({
        ...link,
        isDefaultForChannel: link.id === selectedInviteLinkId,
        isDefaultForBot: link.id === values.botInviteLinkId,
        isDefaultForBroadcast: link.id === values.broadcastInviteLinkId,
        isDefaultForAudienceTransfer:
          link.id === values.audienceTransferInviteLinkId,
        isDefaultForFolders: values.folderDefaultInviteLinkIds.includes(
          link.id,
        ),
        isDefaultForMutualPromotion:
          values.mutualPromotionInviteLinkIds.includes(link.id),
      })),
    [
      linkOptions.links,
      selectedInviteLinkId,
      values.botInviteLinkId,
      values.broadcastInviteLinkId,
      values.audienceTransferInviteLinkId,
      values.folderDefaultInviteLinkIds,
      values.mutualPromotionInviteLinkIds,
    ],
  );

  const registerLink = useRegisterTelegramInviteLink({
    channelId: channel.id,
    onRegistered: () => undefined,
    onPendingChange: onRegisterPendingChange,
  });
  const registerAndSelect = async (
    url: string,
    target: "default" | "folders" | "vp",
  ) => {
    const result = await registerLink.mutateAsync(url.trim());
    if (target === "default") update({ defaultInviteLinkId: result.id });
    if (target === "folders") {
      update({
        folderDefaultInviteLinkIds: selectPrimaryInviteLink(
          values.folderDefaultInviteLinkIds,
          result.id,
        ),
      });
    }
    if (target === "vp") {
      update({
        mutualPromotionInviteLinkIds: selectPrimaryInviteLink(
          values.mutualPromotionInviteLinkIds,
          result.id,
        ),
      });
    }
  };
  const save = useMutation({
    mutationFn: () =>
      telegramChannelsApi.updateQuiet(channel.id, {
        shortDescription: values.description.trim() || null,
        tgStatUrl: values.tgStatUrl.trim() || null,
        presentationIconId: values.presentationIconId || null,
        defaultInviteLinkId: selectedInviteLinkId || null,
        botInviteLinkId: values.botInviteLinkId || null,
        broadcastInviteLinkId: values.broadcastInviteLinkId || null,
        audienceTransferInviteLinkId:
          values.audienceTransferInviteLinkId || null,
        folderDefaultInviteLinkIds: values.folderDefaultInviteLinkIds,
        mutualPromotionInviteLinkIds: values.mutualPromotionInviteLinkIds,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.detail(channel.id),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.inviteLinks(channel.id),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.trafficAttribution(channel.id),
        }),
      ]);
      pushToast("Channel appearance saved", "success");
      onClose();
    },
  });

  const content = (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Used by autogenerated channel lists and their Telegram previews.
      </p>
      <FormField label="Channel emoji">
        <IconPicker
          iconId={values.presentationIconId || null}
          icon={channel.presentationIconPresentation}
          onChange={(value) => update({ presentationIconId: value || "" })}
          allowImages={false}
          buttonLabel="Choose emoji"
        />
      </FormField>
      <FormField label="Short description">
        <Textarea
          value={values.description}
          maxLength={240}
          rows={4}
          onChange={(event) => update({ description: event.target.value })}
          placeholder="A short description shown in generated channel lists"
          className="min-h-24 resize-y whitespace-pre-wrap"
        />
        <p className="mt-1 text-right text-xs text-neutral-500">
          {values.description.length}/240
        </p>
      </FormField>
      <FormField label="TgStat link">
        <Input
          type="url"
          value={values.tgStatUrl}
          onChange={(event) => update({ tgStatUrl: event.target.value })}
          placeholder="https://tgstat.com/channel/..."
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <ChannelInviteLinkSelectField
          label="Main invite link"
          value={selectedInviteLinkId}
          links={links}
          placeholder="Select link"
          disabled={registerLink.isPending}
          loading={linkOptions.loading}
          onOpen={linkOptions.requestAll}
          onChange={(defaultInviteLinkId) => update({ defaultInviteLinkId })}
          onCreate={(url) => registerAndSelect(url, "default")}
        />
        <ChannelInviteLinkSelectField
          label="Invite link for VP"
          value={values.mutualPromotionInviteLinkIds[0] || ""}
          links={links}
          placeholder="Select VP link"
          helpText={
            values.mutualPromotionInviteLinkIds.length > 1
              ? `${values.mutualPromotionInviteLinkIds.length - 1} legacy VP link(s) stay saved for historical attribution.`
              : "The single default invite link for mutual-promotion posts."
          }
          disabled={registerLink.isPending}
          loading={linkOptions.loading}
          onOpen={linkOptions.requestAll}
          onChange={(inviteLinkId) =>
            update({
              mutualPromotionInviteLinkIds: selectPrimaryInviteLink(
                values.mutualPromotionInviteLinkIds,
                inviteLinkId,
              ),
            })
          }
          onCreate={(url) => registerAndSelect(url, "vp")}
        />
        <ChannelInviteLinkSelectField
          label="Invite link for Folders"
          value={values.folderDefaultInviteLinkIds[0] || ""}
          links={links}
          placeholder="Select folder link"
          helpText={
            values.folderDefaultInviteLinkIds.length > 1
              ? `${values.folderDefaultInviteLinkIds.length - 1} legacy folder link(s) stay saved for historical attribution.`
              : "The single default invite link for new folders."
          }
          disabled={registerLink.isPending}
          loading={linkOptions.loading}
          onOpen={linkOptions.requestAll}
          onChange={(inviteLinkId) =>
            update({
              folderDefaultInviteLinkIds: selectPrimaryInviteLink(
                values.folderDefaultInviteLinkIds,
                inviteLinkId,
              ),
            })
          }
          onCreate={(url) => registerAndSelect(url, "folders")}
        />
        <ChannelInviteLinkSelectField
          label="Invite link for bot"
          value={values.botInviteLinkId}
          links={links}
          placeholder="Select bot link"
          helpText="The single invite link used by bot-generated publications."
          disabled={registerLink.isPending}
          loading={linkOptions.loading}
          onOpen={linkOptions.requestAll}
          onChange={(botInviteLinkId) => update({ botInviteLinkId })}
        />
        <ChannelInviteLinkSelectField
          label="Invite link for newsletter"
          value={values.broadcastInviteLinkId}
          links={links}
          placeholder="Select newsletter link"
          helpText="The invite link used in channel newsletters and mailings."
          disabled={registerLink.isPending}
          loading={linkOptions.loading}
          onOpen={linkOptions.requestAll}
          onChange={(broadcastInviteLinkId) =>
            update({ broadcastInviteLinkId })
          }
        />
        <ChannelInviteLinkSelectField
          label="Invite link for audience transfer"
          value={values.audienceTransferInviteLinkId}
          links={links}
          placeholder="Select audience transfer link"
          helpText="The invite link used when transferring an audience to this channel."
          disabled={registerLink.isPending}
          loading={linkOptions.loading}
          onOpen={linkOptions.requestAll}
          onChange={(audienceTransferInviteLinkId) =>
            update({ audienceTransferInviteLinkId })
          }
        />
      </div>
      {registerLink.isError ? (
        <p className="text-sm text-rose-300">
          The invite link could not be verified with Telegram.
        </p>
      ) : null}
      {!embedded ? (
        <div className="flex justify-end gap-2 border-t border-neutral-800 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || registerLink.isPending}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
    </div>
  );
  return embedded ? (
    content
  ) : (
    <Modal open onClose={onClose} title="Channel appearance" size="sm">
      {content}
    </Modal>
  );
}

export function selectPrimaryInviteLink(existing: string[], selected: string) {
  if (!selected) return [];
  // Older workspaces can have more than one purpose link. Keep those IDs as
  // historical source assignments; this form only selects one primary link
  // for new folders and mutual-promotion posts.
  return [selected, ...existing.filter((id) => id !== selected)];
}
