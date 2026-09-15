"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TelegramChannel } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
  Modal,
  MultiSelect,
  Textarea,
} from "@/components/ui/primitives";
import { telegramChannelKeys } from "@/lib/query-keys";
import {
  isTelegramInviteLink,
  telegramInviteLinkDefaultBadgeClassName,
  telegramInviteLinkOptionLabel,
} from "@/lib/features/telegram/telegram-invite-link-options";
import { useAppToast } from "@/providers/toast-provider";
import { TelegramInviteLinkCreatorAvatar } from "./telegram-invite-link-creator-avatar";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import type { ChannelSettingsDraft } from "./channel-settings-draft";
import { useTelegramInviteLinkOptions } from "@/lib/features/telegram/use-telegram-invite-link-options";
import { useRegisterTelegramInviteLink } from "@/lib/features/telegram/use-register-telegram-invite-link";

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
      ...values.folderDefaultInviteLinkIds,
      ...values.mutualPromotionInviteLinkIds,
    ].filter(Boolean),
  });
  const selectedInviteLinkId =
    values.defaultInviteLinkId || linkOptions.initialLink?.id || "";
  const links = useMemo(
    () =>
      linkOptions.links.map((link) => ({
        ...link,
        isDefaultForChannel: link.id === selectedInviteLinkId,
        isDefaultForBot: link.id === values.botInviteLinkId,
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
        folderDefaultInviteLinkIds: [
          ...new Set([...values.folderDefaultInviteLinkIds, result.id]),
        ],
      });
    }
    if (target === "vp") {
      update({
        mutualPromotionInviteLinkIds: [
          ...new Set([...values.mutualPromotionInviteLinkIds, result.id]),
        ],
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
        <FormField label="Main invite link">
          <CustomSelect
            value={selectedInviteLinkId}
            onChange={(defaultInviteLinkId) => update({ defaultInviteLinkId })}
            disabled={registerLink.isPending}
            onOpen={linkOptions.requestAll}
            loading={linkOptions.loading}
            loadingLabel="Loading invite links…"
            placeholder="Select link"
            options={links.map((link) => ({
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
            canCreateOption={(value) =>
              isTelegramInviteLink(value) &&
              !links.some((link) => link.url === value.trim())
            }
            createOptionLabel={() => "Verify and add this invite link"}
            onCreateOption={async (url) => {
              await registerAndSelect(url, "default");
            }}
          />
        </FormField>
        <FormField label="Invite links for VP">
          <MultiSelect
            value={values.mutualPromotionInviteLinkIds}
            onChange={(mutualPromotionInviteLinkIds) =>
              update({ mutualPromotionInviteLinkIds })
            }
            disabled={registerLink.isPending}
            onOpen={linkOptions.requestAll}
            loading={linkOptions.loading}
            loadingLabel="Loading invite links…"
            placeholder="Select VP links"
            searchPlaceholder="Search invite links"
            options={links.map((link) => ({
              value: link.id,
              label: telegramInviteLinkOptionLabel(link),
              selectedLabel: link.name,
              badgeClassName: telegramInviteLinkDefaultBadgeClassName(link),
              iconFallback: inviteLinkCreatorFallback(link),
              icon: (
                <TelegramInviteLinkCreatorAvatar
                  photoUrl={link.creatorPhotoUrl}
                  memberAvatar={link.creatorMember?.avatarPresentation}
                  label={inviteLinkCreatorFallback(link)}
                />
              ),
            }))}
            canCreateOption={(value) =>
              isTelegramInviteLink(value) &&
              !links.some((link) => link.url === value.trim())
            }
            createOptionLabel={() => "Verify and add this invite link"}
            onCreateOption={(url) => registerAndSelect(url, "vp")}
            creatingOption={registerLink.isPending}
          />
          <p className="text-xs text-neutral-500">
            Preferred links for mutual-promotion posts; multiple are allowed.
          </p>
        </FormField>
        <FormField label="Invite links for Folders">
          <MultiSelect
            value={values.folderDefaultInviteLinkIds}
            onChange={(folderDefaultInviteLinkIds) =>
              update({ folderDefaultInviteLinkIds })
            }
            disabled={registerLink.isPending}
            onOpen={linkOptions.requestAll}
            loading={linkOptions.loading}
            loadingLabel="Loading invite links…"
            placeholder="Select folder links"
            searchPlaceholder="Search invite links"
            options={links.map((link) => ({
              value: link.id,
              label: telegramInviteLinkOptionLabel(link),
              selectedLabel: link.name,
              badgeClassName: telegramInviteLinkDefaultBadgeClassName(link),
              iconFallback: inviteLinkCreatorFallback(link),
              icon: (
                <TelegramInviteLinkCreatorAvatar
                  photoUrl={link.creatorPhotoUrl}
                  memberAvatar={link.creatorMember?.avatarPresentation}
                  label={inviteLinkCreatorFallback(link)}
                />
              ),
            }))}
            canCreateOption={(value) =>
              isTelegramInviteLink(value) &&
              !links.some((link) => link.url === value.trim())
            }
            createOptionLabel={() => "Verify and add this invite link"}
            onCreateOption={(url) => registerAndSelect(url, "folders")}
            creatingOption={registerLink.isPending}
          />
          <p className="text-xs text-neutral-500">
            Preferred links loaded automatically when a folder is created;
            multiple are allowed.
          </p>
        </FormField>
        <FormField label="Invite link for bot">
          <CustomSelect
            value={values.botInviteLinkId}
            onChange={(botInviteLinkId) => update({ botInviteLinkId })}
            disabled={registerLink.isPending}
            onOpen={linkOptions.requestAll}
            loading={linkOptions.loading}
            loadingLabel="Loading invite links…"
            placeholder="Select bot link"
            options={links.map((link) => ({
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
          <p className="text-xs text-neutral-500">
            The single invite link used by bot-generated publications.
          </p>
        </FormField>
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
