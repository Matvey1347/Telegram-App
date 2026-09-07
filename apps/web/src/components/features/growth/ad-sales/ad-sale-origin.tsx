import type { TelegramAdSaleOrigin } from "@telegram-system/shared";
import Image from "next/image";

export const adSaleOriginOptions: Array<{
  value: TelegramAdSaleOrigin;
  label: string;
  meta?: "Internal" | "External";
  iconEmoji?: string;
  iconUrl?: string;
}> = [
  {
    value: "DIRECT",
    label: "New sales",
    meta: "Internal",
    iconEmoji: "✨",
  },
  {
    value: "DIRECT_EXTERNAL",
    label: "New sales",
    meta: "External",
    iconEmoji: "✨",
  },
  {
    value: "REPEAT",
    label: "Repeat sales",
    iconEmoji: "🔁",
  },
  {
    value: "ADSELL_IO",
    label: "adsell.io",
    iconUrl: "https://adsell.io/assets/img/favicon.png",
  },
  {
    value: "COLLABORATOR_PRO",
    label: "Collaborator.pro",
    iconUrl: "https://collaborator.pro/favicon-collaborator.ico",
  },
];

export function AdSaleOriginPreview({
  origin,
}: {
  origin: TelegramAdSaleOrigin;
}) {
  const option =
    adSaleOriginOptions.find((item) => item.value === origin) ??
    adSaleOriginOptions[0];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-neutral-200">
      {option.iconUrl ? (
        <Image
          src={option.iconUrl}
          alt=""
          width={20}
          height={20}
          unoptimized
          className="h-5 w-5 rounded object-cover"
        />
      ) : (
        <span aria-hidden className="text-base leading-none">
          {option.iconEmoji}
        </span>
      )}
      <span>{option.label}</span>
      {option.meta ? (
        <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
          {option.meta}
        </span>
      ) : null}
    </span>
  );
}
