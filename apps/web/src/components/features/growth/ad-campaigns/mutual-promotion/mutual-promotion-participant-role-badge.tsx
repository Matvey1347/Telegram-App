import type { MutualPromotionParticipantRole } from "@telegram-system/shared";

export function MutualPromotionParticipantRoleBadge({
  role,
  compact = false,
}: {
  role: MutualPromotionParticipantRole;
  compact?: boolean;
}) {
  const publisher = role === "PUBLISHER";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full ${compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"} ${publisher ? "bg-blue-950 text-blue-200" : "bg-amber-950 text-amber-200"}`}
    >
      {publisher ? "📣 Publisher" : "💳 Paid"}
    </span>
  );
}
