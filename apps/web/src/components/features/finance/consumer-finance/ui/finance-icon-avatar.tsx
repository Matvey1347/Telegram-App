import type { ResolvedEmoji } from "@telegram-system/shared";

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

export function FinanceIconAvatar({
  icon,
  label,
  size = "sm",
  className = "",
  bordered = true,
}: {
  icon?: ResolvedEmoji | null;
  label?: string;
  size?: keyof typeof sizes;
  className?: string;
  bordered?: boolean;
}) {
  const unicode = icon?.type === "unicode";
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ${bordered && !unicode ? "border border-neutral-700 bg-neutral-800" : "bg-neutral-800"} text-white ${sizes[size]} ${className}`;
  if (icon?.type === "image") {
    return (
      <img
        src={icon.url}
        alt={label ?? icon.name ?? ""}
        className={`${base} object-cover`}
      />
    );
  }
  if (unicode)
    return <span className={`${base} ${emojiSizes[size]}`}>{icon.value}</span>;
  return (
    <span className={base}>{(label?.trim()?.[0] || "·").toUpperCase()}</span>
  );
}

export { FinanceIconAvatar as IconAvatar };
