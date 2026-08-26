"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TelegramChannel } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { channelLocalDateKey } from "@/lib/features/growth/telegram-ad-sales";
import type { SalePlacementDraft } from "./ad-sale-types";
import { PlacementPostComposer } from "./placement-post/placement-post-composer";

export function AdSaleSharedPost({
  placements,
  channels,
  systemBotUsername,
  onSystemBotReturn,
  setPlacements,
}: {
  placements: SalePlacementDraft[];
  channels: TelegramChannel[];
  systemBotUsername?: string | null;
  onSystemBotReturn?: () => void;
  setPlacements: Dispatch<SetStateAction<SalePlacementDraft[]>>;
}) {
  const [expanded, setExpanded] = useState(false);
  const waitingForBotRef = useRef(false);
  useEffect(() => {
    const handleFocus = () => {
      if (!waitingForBotRef.current) return;
      waitingForBotRef.current = false;
      onSystemBotReturn?.();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [onSystemBotReturn]);
  const first = placements[0];
  const channel = channels.find((item) => item.id === first?.channelId);
  const draft = placements.find(
    (item) => item.managedPostDraft,
  )?.managedPostDraft;
  const allFuture = placements.every(
    (placement) =>
      placement.date >= channelLocalDateKey(new Date(), placement.timezone),
  );
  if (placements.length < 2) return null;
  return (
    <section className="rounded-xl border border-blue-900/70 bg-blue-950/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">
            One post for all placements
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Create the content once; a channel-owned copy will be scheduled for
            every placement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {systemBotUsername ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                waitingForBotRef.current = true;
                window.open(
                  `https://t.me/${systemBotUsername.replace(/^@/, "")}?start=ad_sale`,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
            >
              Forward post to Telegram bot
            </Button>
          ) : null}
          <Button type="button" onClick={() => setExpanded((value) => !value)}>
            {draft ? "Edit shared post" : "Create shared post"}
          </Button>
        </div>
      </div>
      {expanded ? (
        <div className="mt-4">
          <PlacementPostComposer
            channelTitle={channel?.title ?? "Network"}
            channelPhotoUrl={channel?.photoUrl}
            draft={draft}
            existingPostId={null}
            publishedPosts={[]}
            postsLoading={false}
            canCreate={allFuture}
            autoCreate={allFuture}
            onLoadPublishedPosts={() => undefined}
            onChange={({ draft: nextDraft }) =>
              setPlacements((current) =>
                current.map((placement) => ({
                  ...placement,
                  managedPostDraft: nextDraft ?? null,
                  telegramPostId: null,
                })),
              )
            }
          />
        </div>
      ) : null}
    </section>
  );
}
