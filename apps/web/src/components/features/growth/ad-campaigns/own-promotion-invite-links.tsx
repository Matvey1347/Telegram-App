"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button, Modal } from "@/components/ui/primitives";
import { TelegramInviteLinkCreateInline } from "@/components/features/telegram/telegram/telegram-invite-link-create-inline";
import type { CrossPromotionTargetInput } from "@telegram-system/shared";
import type { TelegramChannel } from "@/lib/api";

export function promotionLinkTitle(title: string, date: string, views?: number | null) {
  const metrics = ` · ${date || "—"} · ${views == null ? "—" : Math.round(views)}👁`;
  // Telegram accepts at most 32 characters for an invite-link title.
  return Array.from(title).slice(0, 32 - Array.from(metrics).length).join("") + metrics;
}

export function OwnPromotionInviteLinks({
  value,
  publishers,
  placementDateFor,
  onChange,
}: {
  value: CrossPromotionTargetInput;
  publishers: TelegramChannel[];
  placementDateFor: (channelId: string) => string;
  onChange: (value: CrossPromotionTargetInput) => void;
}) {
  const [publisher, setPublisher] = useState<TelegramChannel | null>(null);
  const links = value.publisherInviteLinks ?? {};
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-neutral-200">Unique links by publishing channel</p>
      <div className="flex flex-wrap items-center gap-2">
        {publishers.map((channel) => (
          <div key={channel.id} className="flex items-center gap-1">
            {links[channel.id] ? (
              <>
                <a className="break-all text-sm text-blue-300" href={links[channel.id].url} target="_blank" rel="noreferrer">{channel.title}</a>
                <Button type="button" variant="secondary" aria-label={`Use shared link for ${channel.title}`} onClick={() => {
                  const next = { ...links };
                  delete next[channel.id];
                  onChange({ ...value, publisherInviteLinks: next });
                }}>Use shared link</Button>
              </>
            ) : (
              <Button type="button" variant="secondary" onClick={() => setPublisher(channel)}>
                <Link2 size={14} aria-hidden /> {channel.title}
              </Button>
            )}
          </div>
        ))}
      </div>
      <Modal open={Boolean(publisher)} size="sm" title="Create channel tracking link" onClose={() => setPublisher(null)}>
        {publisher && (
          <TelegramInviteLinkCreateInline
            key={publisher.id}
            channelId={value.telegramChannelId}
            initialTitle={promotionLinkTitle(publisher.title, placementDateFor(publisher.id), publisher.ownViewsPerPost)}
            open
            onOpenChange={(open) => { if (!open) setPublisher(null); }}
            onCreated={(link) => onChange({
              ...value,
              publisherInviteLinks: { ...links, [publisher.id]: { id: link.id, url: link.url } },
            })}
          />
        )}
      </Modal>
    </div>
  );
}
