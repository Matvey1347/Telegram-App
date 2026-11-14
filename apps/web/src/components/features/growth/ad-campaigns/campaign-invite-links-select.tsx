"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { TelegramInviteLink, TelegramInviteLinkOption } from "@/lib/api";
import { useTelegramInviteLinkOptions } from "@/lib/features/telegram/use-telegram-invite-link-options";
import { useRegisterTelegramInviteLink } from "@/lib/features/telegram/use-register-telegram-invite-link";
import { inviteLinkCreatorFallback } from "@/lib/features/telegram/telegram-invite-link-creator";
import {
  isTelegramInviteLink,
  telegramInviteLinkOptionLabel,
} from "@/lib/features/telegram/telegram-invite-link-options";
import { TelegramInviteLinkOptionLabel } from "@/components/features/telegram/telegram/telegram-invite-link-option-label";
import { TelegramInviteLinkCreatorAvatar } from "@/components/features/telegram/telegram/telegram-invite-link-creator-avatar";
import { CampaignMultiValueSelect } from "./campaign-multi-value-select";
import { CustomSelect, DateInput } from "@/components/ui/primitives";

export function CampaignInviteLinksSelect({
  channelId,
  campaignId,
  value,
  initialLinks,
  enabled,
  onChange,
  windows,
  onWindowChange,
}: {
  channelId: string;
  campaignId?: string;
  value: string[];
  initialLinks: TelegramInviteLink[];
  enabled: boolean;
  onChange: (value: string[]) => void;
  windows: Record<string, string>;
  onWindowChange: (id: string, date: string) => void;
}) {
  const [registeredLinks, setRegisteredLinks] = useState<TelegramInviteLinkOption[]>([]);
  const [openWindows, setOpenWindows] = useState<string[]>([]);
  const selectedIdsRef = useRef(value);
  useEffect(() => {
    selectedIdsRef.current = value;
  }, [value]);

  const query = useTelegramInviteLinkOptions({
    channelId,
    selectedId: value[0],
    selectedIds: value,
    enabled,
    includeUnavailable: false,
    availableForCampaignId: campaignId,
    seedLinks: initialLinks,
  });
  const registerLink = useRegisterTelegramInviteLink({
    channelId,
    onRegistered: (link) => {
      const option: TelegramInviteLinkOption = {
        id: link.id,
        telegramChannelId: channelId,
        name: link.name,
        url: link.url,
      };
      setRegisteredLinks((current) => [
        ...current.filter((item) => item.id !== link.id),
        option,
      ]);
      onChange([...new Set([...selectedIdsRef.current, link.id])]);
    },
  });

  const optionsById = new Map(
    [...query.links, ...registeredLinks.filter((link) => link.telegramChannelId === channelId)]
      .map((link) => [link.id, link]),
  );
  const activeWindows = value.filter((id) => openWindows.includes(id) || windows[id]);
  const availableIds = value.filter((id) => !activeWindows.includes(id));
  const windowOption = (id: string) => {
    const link = optionsById.get(id);
    const label = link ? telegramInviteLinkOptionLabel(link) : "Пригласительная ссылка";
    return {
      value: id,
      label,
      labelContent: link ? <TelegramInviteLinkOptionLabel link={link} /> : label,
      icon: <TelegramInviteLinkCreatorAvatar photoUrl={link?.creatorPhotoUrl} label={link ? inviteLinkCreatorFallback(link) : label} />,
    };
  };

  return (
    <div className="space-y-2"><CampaignMultiValueSelect
      value={value}
      onChange={onChange}
      onOpen={query.requestAll}
      loading={query.loading}
      loadingLabel="Loading invite links…"
      placeholder="Select invite links"
      options={[...optionsById.values()].map((link) => ({
        value: link.id,
        label: telegramInviteLinkOptionLabel(link),
        labelContent: <TelegramInviteLinkOptionLabel link={link} />,
        description: link.url,
        searchText: link.url,
        iconFallback: inviteLinkCreatorFallback(link),
        icon: (
          <TelegramInviteLinkCreatorAvatar
            photoUrl={link.creatorPhotoUrl}
            label={inviteLinkCreatorFallback(link)}
          />
        ),
      }))}
      canCreateOption={(input) =>
        isTelegramInviteLink(input) &&
        !query.links.some((link) => link.url === input.trim())
      }
      onCreateOption={async (url) => {
        await registerLink.mutateAsync(url);
      }}
    />
    {activeWindows.map((id) => (
      <div key={id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
        <CustomSelect ariaLabel={`Ссылка для ограничения: ${windowOption(id).label}`} value={id} searchable={false} options={[id, ...availableIds].map(windowOption)} onChange={(next) => {
          if (!next || next === id) return;
          onWindowChange(id, "");
          onWindowChange(next, windows[id] || "");
          setOpenWindows((current) => [...new Set([...current.filter((item) => item !== id), next])]);
        }} />
        <DateInput aria-label={`Считать с даты: ${windowOption(id).label}`} value={windows[id] || ""} onChange={(event) => onWindowChange(id, event.target.value)} />
        <button type="button" aria-label={`Убрать ограничение: ${windowOption(id).label}`} title="Убрать ограничение" className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-600 text-red-400 hover:bg-red-950/50 hover:text-red-300" onClick={() => { onWindowChange(id, ""); setOpenWindows((current) => current.filter((item) => item !== id)); }}><Trash2 size={16} /></button>
      </div>
    ))}
    {availableIds.length > 0 && <CustomSelect ariaLabel="Ограничить ссылку по дате" value="" placeholder="Ограничить ссылку по дате…" searchable={false} options={availableIds.map(windowOption)} onChange={(id) => { if (id) setOpenWindows((current) => [...new Set([...current, id])]); }} />}
    {activeWindows.length > 0 && <p className="text-xs text-muted-foreground">Считаются вступившие и ожидающие с указанной даты. Отклонённые заявки Telegram не предоставляет.</p>}
    </div>
  );
}
