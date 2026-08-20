import { BarChart3, KeyRound, RadioTower, Send } from "lucide-react";
import type { TelegramBotChannelAccessSummary } from "@telegram-system/shared";

export function AccessBotSummary({
  summary,
}: {
  summary: TelegramBotChannelAccessSummary;
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      aria-label="Channel access capabilities"
    >
      <Capability
        icon={RadioTower}
        label="Channels"
        value={summary.totalChannels}
      />
      <Capability icon={Send} label="Can post" value={summary.canPost} />
      <Capability
        icon={KeyRound}
        label="Invite links"
        value={summary.canManageInviteLinks}
      />
      <Capability icon={BarChart3} label="Stats" value={summary.canViewStats} />
    </div>
  );
}

function Capability({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Send;
  label: string;
  value: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-300">
      <Icon size={13} aria-hidden="true" />
      {label} <span className="font-semibold text-neutral-100">{value}</span>
    </span>
  );
}
