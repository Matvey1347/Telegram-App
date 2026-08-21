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
  const metrics = summary ?? {
    registeredUsers: 0,
    paidUsers: 0,
    activeSubscriptions: 0,
    failedPayments: 0,
  };
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4"
      aria-label="Finance business metrics"
    >
      <Metric label="Registered" value={metrics.registeredUsers} />
      <Metric label="Paid" value={metrics.paidUsers} />
      <Metric label="Active" value={metrics.activeSubscriptions} />
      <Metric
        label="Failed"
        value={metrics.failedPayments}
        attention={metrics.failedPayments > 0}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-0.5 text-base font-semibold ${attention ? "text-rose-300" : "text-neutral-100"}`}
      >
        {value}
      </p>
    </div>
  );
}
