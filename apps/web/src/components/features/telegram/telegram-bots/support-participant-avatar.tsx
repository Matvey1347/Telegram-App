"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupportTicket } from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { supportKeys, telegramSupportApi, type SupportAvatarKind } from "@/lib/features/telegram/telegram-support-api";

export function SupportParticipantAvatar({
  ticket, kind, label, size, fallback, lazy = false,
}: {
  ticket: SupportTicket;
  kind: SupportAvatarKind;
  label: string;
  size?: ComponentProps<typeof IconAvatar>["size"];
  fallback?: ComponentProps<typeof IconAvatar>["icon"];
  lazy?: boolean;
}) {
  const target = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [image, setImage] = useState<{ blob: Blob; url: string }>();
  const photo = useQuery({
    queryKey: supportKeys.avatar(ticket.workspaceId, ticket.id, kind),
    queryFn: ({ signal }) => telegramSupportApi.avatar(ticket.id, kind, signal),
    enabled: !lazy || visible,
    staleTime: 60_000,
    gcTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!lazy || visible || !target.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(target.current);
    return () => observer.disconnect();
  }, [lazy, visible]);

  useEffect(() => {
    const blob = photo.data;
    if (!blob || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(blob);
    let active = true;
    queueMicrotask(() => {
      if (active) setImage({ blob, url });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [photo.data]);

  const icon = image && image.blob === photo.data
    ? { type: "image" as const, id: ticket.id, url: image.url, name: label }
    : fallback;

  return (
    <span ref={target} className="inline-flex shrink-0" aria-hidden="true">
      <IconAvatar icon={icon} label={label} size={size} decorative bordered={false} className="!rounded-full" />
    </span>
  );
}
