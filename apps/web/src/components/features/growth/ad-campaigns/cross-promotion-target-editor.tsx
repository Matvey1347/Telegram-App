"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { CrossPromotionTargetInput } from "@telegram-system/shared";
import {
  promosApi,
  type Promo,
  type TelegramChannel,
  type TelegramInviteLink,
} from "@/lib/api";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import { CustomSelect, FormField } from "@/components/ui/primitives";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import {
  telegramInviteLinkOptionLabel,
  isTelegramInviteLink,
} from "@/lib/features/telegram/telegram-invite-link-options";
import { TelegramInviteLinkOptionLabel } from "@/components/features/telegram/telegram/telegram-invite-link-option-label";
import { useTelegramInviteLinkOptions } from "@/lib/features/telegram/use-telegram-invite-link-options";
import { useRegisterTelegramInviteLink } from "@/lib/features/telegram/use-register-telegram-invite-link";

export function CrossPromotionTargetEditor({
  channel,
  value,
  onChange,
  onResolved,
  showPromo = true,
}: {
  channel: TelegramChannel;
  value: CrossPromotionTargetInput;
  onChange: (value: CrossPromotionTargetInput) => void;
  onResolved?: (value: {
    promo?: Promo;
    inviteLink?: TelegramInviteLink;
  }) => void;
  showPromo?: boolean;
}) {
  const [registeredLinks, setRegisteredLinks] = useState<TelegramInviteLink[]>(
    [],
  );
  const promosQuery = useQuery({
    queryKey: ["cross-promotion", "promos", channel.id],
    queryFn: () =>
      promosApi.listPage({
        page: 1,
        pageSize: 100,
        telegramChannelId: channel.id,
      }),
    staleTime: 30_000,
    enabled: showPromo,
  });
  const linkOptions = useTelegramInviteLinkOptions({
    channelId: channel.id,
    selectedId: value.inviteLinkId,
    seedLinks: registeredLinks,
  });
  const promoDetailQuery = useQuery({
    queryKey: ["cross-promotion", "promo-detail", value.promoId],
    queryFn: () => promosApi.get(value.promoId as string),
    enabled: showPromo && Boolean(value.promoId),
    staleTime: 30_000,
  });
  const promos = promosQuery.data?.items ?? [];
  const links = linkOptions.links;
  const resolvedPromo =
    promoDetailQuery.data ??
    promos.find((promo) => promo.id === (value.promoId ?? ""));
  const resolvedInvite = links.find((link) => link.id === value.inviteLinkId);
  const registerLink = useRegisterTelegramInviteLink({
    channelId: channel.id,
    onRegistered: (result, url) => {
      const link: TelegramInviteLink = {
        id: result.id,
        telegramChannelId: channel.id,
        name: "Mutual promotion",
        url,
        joinedCount: 0,
        requestedCount: 0,
        isRevoked: false,
      };
      setRegisteredLinks((current) => [
        ...current.filter((item) => item.id !== link.id),
        link,
      ]);
      const next = { ...value, inviteLinkId: link.id };
      onChange(next);
      onResolved?.({ promo: resolvedPromo, inviteLink: link });
    },
  });
  useEffect(() => {
    if (resolvedPromo || resolvedInvite)
      onResolved?.({ promo: resolvedPromo, inviteLink: resolvedInvite });
  }, [onResolved, resolvedInvite, resolvedPromo]);
  useEffect(() => {
    if (value.inviteLinkId || !linkOptions.initialLink) return;
    onChange({ ...value, inviteLinkId: linkOptions.initialLink.id });
  }, [linkOptions.initialLink, onChange, value]);

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/55 p-3">
      <div className="mb-3 flex items-center gap-2">
        {channel.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={channel.photoUrl}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800 text-xs">
            {channel.title.slice(0, 2).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {channel.title}
          </p>
          <p className="text-xs text-neutral-500">Channel being promoted</p>
        </div>
      </div>
      <div className={`grid gap-3 ${showPromo ? "md:grid-cols-2" : ""}`}>
        {showPromo ? (
          <FormField label="Promo" required>
            <CustomSelect
              value={value.promoId ?? ""}
              onChange={(promoId) => {
                const selectedPromo = promos.find(
                  (promo) => promo.id === promoId,
                );
                const next = {
                  ...value,
                  promoId,
                  inviteLinkId:
                    selectedPromo?.defaultInviteLinkId ?? value.inviteLinkId,
                };
                onChange(next);
                queueMicrotask(() =>
                  onResolved?.({
                    promo: selectedPromo,
                    inviteLink: resolvedInvite,
                  }),
                );
              }}
              placeholder={
                promosQuery.isLoading ? "Loading promos…" : "Select promo"
              }
              options={promos.map((promo) => ({
                value: promo.id,
                label: promo.title,
                iconPresentation: promo.iconPresentation ?? undefined,
                iconFallback: promo.title,
              }))}
            />
          </FormField>
        ) : null}
        <FormField label="Tracking invite link" required>
          <CustomSelect
            value={value.inviteLinkId}
            onChange={(inviteLinkId) => {
              const next = { ...value, inviteLinkId };
              onChange(next);
              queueMicrotask(() =>
                onResolved?.({
                  promo: resolvedPromo,
                  inviteLink: links.find((link) => link.id === inviteLinkId),
                }),
              );
            }}
            onOpen={linkOptions.requestAll}
            loading={linkOptions.loading}
            loadingLabel="Loading invite links…"
            placeholder="Select invite link"
            options={links.map((link) => ({
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
              !links.some((link) => link.url === input.trim())
            }
            createOptionLabel={() => "Verify and add this invite link"}
            onCreateOption={async (url) => {
              await registerLink.mutateAsync(url);
            }}
          />
        </FormField>
      </div>
      {registerLink.isError ? (
        <p className="mt-2 text-xs text-rose-300">
          The invite link could not be verified with Telegram.
        </p>
      ) : null}
      {showPromo && !promosQuery.isLoading && !promos.length ? (
        <p className="mt-2 text-xs text-amber-300">
          Create a promo for this channel in the Promo tab first.
        </p>
      ) : null}
    </section>
  );
}
