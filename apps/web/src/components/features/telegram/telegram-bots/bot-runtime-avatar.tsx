"use client";

import { useEffect, useState } from "react";
import { Bot, Wallet } from "lucide-react";
import type { TelegramBotApplicationType } from "@telegram-system/shared";
import { api } from "@/lib/api";

const avatarCache = new Map<string, string>();
const maxCachedAvatars = 8;

function cacheAvatar(sourceKey: string, objectUrl: string) {
  avatarCache.set(sourceKey, objectUrl);
  while (avatarCache.size > maxCachedAvatars) {
    const oldestKey = avatarCache.keys().next().value;
    if (!oldestKey) return;
    const oldestUrl = avatarCache.get(oldestKey);
    avatarCache.delete(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  }
}

export function BotRuntimeAvatar({
  type,
  avatarUrl,
  refreshKey,
}: {
  type: TelegramBotApplicationType;
  avatarUrl?: string | null;
  refreshKey?: number;
}) {
  const sourceKey = `${avatarUrl ?? ""}:${refreshKey ?? ""}`;
  const [loadedSourceKey, setLoadedSourceKey] = useState<string | null>(null);
  const cachedAvatarUrl = avatarCache.get(sourceKey);
  const isBundledBrandAsset = avatarUrl?.startsWith("/brand/") ?? false;

  useEffect(() => {
    if (!avatarUrl || isBundledBrandAsset) return;
    if (avatarCache.has(sourceKey)) return;
    const controller = new AbortController();
    void api
      .get<Blob>(avatarUrl, {
        responseType: "blob",
        signal: controller.signal,
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        cacheAvatar(sourceKey, URL.createObjectURL(response.data));
        setLoadedSourceKey(sourceKey);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadedSourceKey(null);
      });
    return () => {
      controller.abort();
    };
  }, [avatarUrl, isBundledBrandAsset, sourceKey]);

  const isFinanceBot = type === "FINANCE";
  const Icon = isFinanceBot ? Wallet : Bot;
  return (
    <div
      aria-label={`${isFinanceBot ? "Finance" : "Access"} bot`}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-transparent"
    >
      {isBundledBrandAsset ? (
        // Bundled brand assets do not go through the authenticated API client.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl ?? undefined} alt="" className="h-full w-full rounded-lg object-cover" />
      ) : cachedAvatarUrl && (loadedSourceKey === sourceKey || avatarCache.has(sourceKey)) ? (
        <>
          {/* Blob URLs from an authenticated request cannot use next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cachedAvatarUrl}
            alt=""
            className="h-full w-full rounded-lg object-cover"
            onError={() => {
              avatarCache.delete(sourceKey);
              setLoadedSourceKey(null);
            }}
          />
        </>
      ) : (
        <Icon size={20} aria-hidden="true" />
      )}
    </div>
  );
}
