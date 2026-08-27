import { IconAvatar } from "@/components/icons/icon-avatar";
import type { Account } from "@/lib/api";

export function CurrencyAmount({
  amount,
  currency,
  className = "text-white",
}: {
  amount?: number | string | null;
  currency?: string | null;
  className?: string;
}) {
  const value = Number(amount ?? 0);
  const label = Number.isFinite(value)
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(value)
    : "—";
  return <span className={className}>{label}</span>;
}

export function AccountPreview({ account, fallback }: { account?: Account | null; fallback?: string }) {
  const member = account?.assignedMember;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <IconAvatar icon={account?.iconPresentation} label={account?.currency || account?.name || "A"} size="sm" />
      <div className="min-w-0">
        <div className="truncate font-medium text-white">{account?.name || fallback || "Account"}</div>
        <div className="flex items-center gap-1.5 truncate text-xs text-neutral-500">
          {member ? <IconAvatar icon={member.avatarPresentation} label={member.user.name} size="xs" /> : null}
          <span className="truncate">{member?.user.name || account?.currency || "Unassigned"}</span>
        </div>
      </div>
    </div>
  );
}
