import { CreditCard, UsersRound } from "lucide-react";
import type {
  TelegramBotFinanceApplicationSummary,
  TelegramBotRuntimeEnvironment,
} from "@telegram-system/shared";

export function FinanceBotSummary({
  summary,
}: {
  summary:
    | TelegramBotFinanceApplicationSummary["finance"][TelegramBotRuntimeEnvironment]
    | undefined;
}) {
  return (
    <div
      className="grid grid-cols-2 gap-2"
      aria-label="Finance business metrics"
    >
      <div className="rounded-lg border border-neutral-800 p-3">
        <p className="flex items-center gap-2 text-sm text-neutral-400">
          <UsersRound size={16} /> Registered
        </p>
        <p className="text-lg font-semibold">{summary?.registeredUsers ?? 0}</p>
        <p className="text-xs text-neutral-400">
          {summary?.activeUsers ?? 0} active in 30 days
        </p>
      </div>
      <div className="rounded-lg border border-neutral-800 p-3">
        <p className="flex items-center gap-2 text-sm text-neutral-400">
          <CreditCard size={16} /> Paid
        </p>
        <p className="text-lg font-semibold">{summary?.paidUsers ?? 0}</p>
        <p className="text-xs text-neutral-400">
          {summary?.activePaidUsers ?? 0} active in 30 days
        </p>
      </div>
    </div>
  );
}
