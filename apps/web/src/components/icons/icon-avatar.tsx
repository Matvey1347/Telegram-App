"use client";

import type { ResolvedEmoji } from "@/lib/api";
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

export function IconAvatar({
  icon,
  label,
  size = "sm",
  className = "",
  bordered = true,
  decorative = false,
}: {
  icon?: ResolvedEmoji | null;
  label?: string;
  size?: keyof typeof sizes;
  className?: string;
  bordered?: boolean;
  decorative?: boolean;
}) {
  const hasEmoji = icon?.type === "unicode";
  const hasImage = icon?.type === "image";
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ${
    bordered && !hasEmoji && !hasImage ? "border border-neutral-700" : ""
  } ${
    hasImage ? "bg-transparent" : "bg-neutral-800"
  } text-white ${sizes[size]} ${className}`;
  const fallbackClassName = `${base} !bg-neutral-800`;

  const fallback = (Array.from(label?.trim() || "")[0] || "·").toUpperCase();

  if (icon?.type === "image") {
    return (
      <AvatarImage
        key={icon.url}
        url={icon.url}
        alt={decorative ? "" : (label ?? icon.name ?? "")}
        className={base}
        fallbackClassName={fallbackClassName}
        fallback={fallback}
      />
    );
  }

  if (icon?.type === "unicode") {
    return (
      <PremiumEmoji icon={icon} className={`${base} ${emojiSizes[size]}`} />
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
      onError={() => setFailed(true)}
    />
  );
}
