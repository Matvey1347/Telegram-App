"use client";

import type { ResolvedEmoji } from "@/lib/api";
import { telegramChannelsApi } from "@/lib/api";
import { workspaceKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PremiumEmoji } from "./premium-emoji";

const sizes = {
  xs: "h-5 w-5",
  sm: "h-7 w-7",
  md: "h-9 w-9",
  lg: "h-12 w-12",
} as const;

const emojiSizes = {
  xs: "text-sm",
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
} as const;

type IconAvatarProps = {
  icon?: ResolvedEmoji | null;
  label?: string;
  size?: keyof typeof sizes;
  className?: string;
  bordered?: boolean;
  decorative?: boolean;
};

export function IconAvatar(props: IconAvatarProps) {
  const icon = props.icon;
  if (
    icon?.type === "unicode" &&
    icon.telegramCustomEmojiId &&
    !icon.telegramCustomEmojiAssetUrl &&
    !icon.telegramCustomEmojiRenderAssetUrl
  ) {
    return <UnresolvedCustomEmojiAvatar {...props} />;
  }
  return <IconAvatarView {...props} />;
}

function UnresolvedCustomEmojiAvatar(props: IconAvatarProps) {
  const icon = props.icon;
  const customEmojiId =
    icon?.type === "unicode" ? icon.telegramCustomEmojiId : null;
  const customEmojiPacks = useQuery({
    queryKey: workspaceKeys.telegramCustomEmojiPacks(),
    queryFn: () => telegramChannelsApi.customEmojiPacks(),
    staleTime: 5 * 60_000,
  });
  const resolvedCustomEmoji = customEmojiId
    ? ((customEmojiPacks.data?.packs ?? []).flatMap((pack) => {
        const emoji = pack.emojis.find(
          (item) => item.documentId === customEmojiId,
        );
        return emoji
          ? [
              {
                type: "unicode" as const,
                value: emoji.alt || "◇",
                name: emoji.alt || pack.title,
                telegramCustomEmojiId: emoji.documentId,
                telegramCustomEmojiKind: emoji.kind,
                telegramCustomEmojiAssetUrl: emoji.assetUrl,
                telegramCustomEmojiRenderAssetUrl: emoji.renderAssetUrl,
              },
            ]
          : [];
      })[0] ?? null)
    : null;
  return (
    <IconAvatarView
      {...props}
      icon={
        icon?.type === "unicode" && resolvedCustomEmoji
          ? { ...icon, ...resolvedCustomEmoji }
          : icon
      }
    />
  );
}

function IconAvatarView({
  icon,
  label,
  size = "sm",
  className = "",
  bordered = true,
  decorative = false,
}: IconAvatarProps) {
  const displayIcon = icon;
  const hasEmoji = displayIcon?.type === "unicode";
  const hasImage = displayIcon?.type === "image";
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ${
    bordered && !hasEmoji && !hasImage ? "border border-neutral-700" : ""
  } ${
    hasImage ? "bg-transparent" : "bg-neutral-800"
  } text-white ${sizes[size]} ${className}`;
  const fallbackClassName = `${base} !bg-neutral-800`;

  const fallback = (Array.from(label?.trim() || "")[0] || "·").toUpperCase();

  if (displayIcon?.type === "image") {
    return (
      <AvatarImage
        key={displayIcon.url}
        url={displayIcon.url}
        alt={decorative ? "" : (label ?? displayIcon.name ?? "")}
        className={base}
        fallbackClassName={fallbackClassName}
        fallback={fallback}
      />
    );
  }

  if (displayIcon?.type === "unicode") {
    return (
      <PremiumEmoji
        icon={displayIcon}
        className={`${base} ${emojiSizes[size]}`}
      />
    );
  }

  return <span className={base}>{fallback}</span>;
}

function AvatarImage({
  url,
  alt,
  className,
  fallbackClassName,
  fallback,
}: {
  url: string;
  alt: string;
  className: string;
  fallbackClassName: string;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={fallbackClassName}>{fallback}</span>;
  return (
    // Entity avatars can use authenticated or temporary URLs unsupported by next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={`${className} object-cover`}
      onLoad={(event) => {
        if (
          event.currentTarget.naturalWidth <= 1 ||
          event.currentTarget.naturalHeight <= 1
        )
          setFailed(true);
      }}
      onError={() => setFailed(true)}
    />
  );
}
