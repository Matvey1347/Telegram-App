"use client";

import { MessageSquare } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  CrmContactListItem,
  CrmMemberSummary,
} from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { formatDateTime } from "@/lib/date-format";
import { MasonryGrid, Skeleton } from "@/components/ui/primitives";

export function formatCrmContactDateTime(value: string | null) {
  return value ? formatDateTime(value) : "—";
}

export function CrmContactRevenue({
  amounts,
}: {
  amounts: CrmContactListItem["salesSummary"]["revenueByCurrency"];
}) {
  if (!amounts.length) return <span className="text-neutral-500">—</span>;
  return (
    <span className="flex flex-col gap-0.5 tabular-nums">
      {amounts.map((item) => (
        <span key={item.currency}>
          {formatAmount(item.amount)} {item.currency}
        </span>
      ))}
    </span>
  );
}

function formatAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
        amount,
      )
    : value;
}

export function DealMembersPreview({
  members,
}: {
  members: CrmMemberSummary[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <details
      ref={rootRef}
      open={open}
      className="group relative w-fit"
      onClick={(event) => event.stopPropagation()}
    >
      <summary
        aria-label={`Show ${members.length} deal ${members.length === 1 ? "member" : "members"}`}
        onClick={(event) => {
          event.preventDefault();
          setOpen((current) => !current);
        }}
        className="flex cursor-pointer list-none items-center justify-end rounded-md outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex -space-x-2">
          {members.map((member) => (
            <span
              key={member.id}
              className="rounded-full ring-2 ring-neutral-950"
            >
              <IconAvatar
                icon={member.avatarPresentation}
                label={member.name}
                size="xs"
              />
            </span>
          ))}
        </span>
      </summary>
      <div className="absolute right-0 top-full z-30 mt-2 min-w-56 space-y-1 rounded-lg border border-neutral-700 bg-neutral-950 p-2 shadow-xl">
        {members.map((member) => (
          <div key={member.id} className="flex items-center gap-2 px-1 py-1">
            <IconAvatar
              icon={member.avatarPresentation}
              label={member.name}
              size="xs"
            />
            <span className="whitespace-nowrap text-xs text-neutral-200">
              {member.name}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

export function CrmMinimizedChatLauncher({
  count,
  onRestore,
}: {
  count: number;
  onRestore: () => void;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        data-testid="minimized-chat-safe-area"
        className="h-20 shrink-0"
      />
      <button
        type="button"
        onClick={onRestore}
        aria-label={`Restore ${count} open ${count === 1 ? "chat" : "chats"}`}
        title="Open chats"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-blue-500 bg-blue-600 text-white shadow-2xl transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-neutral-950"
      >
        <MessageSquare size={24} />
        <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-neutral-950 bg-neutral-100 px-1 text-xs font-semibold text-neutral-950">
          {count}
        </span>
      </button>
    </>
  );
}

export function CrmContactsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div aria-label="Loading contacts">
      <MasonryGrid>
        {Array.from({ length: count }, (_, index) => (
          <article
            key={index}
            aria-label="Loading contact card"
            className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
          >
            <div className="flex items-start gap-2.5">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-3 w-36 max-w-full" />
              </div>
              <Skeleton className="h-7 w-5 shrink-0" />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3 border-t border-neutral-900 pt-3">
              {Array.from({ length: 4 }, (_, metric) => (
                <div key={metric} className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-5 w-4/5" />
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2 border-t border-neutral-900 pt-3">
              <Skeleton className="ml-auto h-3 w-24" />
              <Skeleton className="ml-auto h-3 w-36 max-w-full" />
            </div>
          </article>
        ))}
      </MasonryGrid>
    </div>
  );
}
