import Image from "next/image";
import type { ConsumerFinanceAssistantProposal } from "@telegram-system/shared";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";
import { Button } from "./ui";
import { financeAssistantCopy } from "./i18n/assistant";

export function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="mr-8 flex items-end gap-2">
      <Image
        src="/finance/assistant/jarvis-v1.webp"
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 shrink-0 rounded-full border border-cyan-500/20 bg-cyan-950/40 object-cover"
      />
      <p className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-neutral-800 bg-neutral-900/80 px-3.5 py-2.5 text-sm leading-5 text-neutral-200">
        {children}
      </p>
    </div>
  );
}

export function AssistantProposalCard({
  proposal,
  t,
  confirming,
  cancelling,
  onConfirm,
  onCancel,
}: {
  proposal: ConsumerFinanceAssistantProposal;
  t: ReturnType<typeof financeAssistantCopy>;
  confirming: boolean;
  cancelling: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2 rounded-xl border border-amber-800 bg-amber-950/20 p-3">
      <p className="text-sm font-medium text-amber-200">{t.proposal}</p>
      {proposal.operations.map((operation, index) => (
        <div
          key={`${operation.occurredAt}-${index}`}
          className="rounded-lg bg-neutral-950/70 p-2 text-sm"
        >
          <div className="flex justify-between gap-3">
            <span>{operation.description}</span>
            <span
              className="shrink-0 tabular-nums"
              aria-label={t.cashMovement}
            >
              {formatMoney(operation.amount, operation.currency, "symbol")}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            {operation.accountName}
            {operation.categoryName ? ` · ${operation.categoryName}` : ""}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-neutral-500">{t.economicEffect}</dt>
            <dd className="text-right tabular-nums text-neutral-200">
              {formatMoney(
                operation.economicAmount ?? operation.amount,
                operation.currency,
                "symbol",
              )}
            </dd>
            <dt className="text-neutral-500">{t.meaning}</dt>
            <dd className="text-right text-neutral-200">
              {assistantPurposeLabel(operation.purpose ?? "ORDINARY", t)}
            </dd>
            {operation.type === "EXPENSE" ? (
              <>
                <dt className="text-neutral-500">{t.necessity}</dt>
                <dd className="text-right text-neutral-200">
                  {assistantNecessityLabel(
                    operation.necessity ?? "UNSPECIFIED",
                    t,
                  )}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      ))}
      <div className="flex gap-2">
        <Button disabled={confirming} onClick={onConfirm}>
          {t.confirm}
        </Button>
        <Button variant="secondary" disabled={cancelling} onClick={onCancel}>
          {t.cancel}
        </Button>
      </div>
    </div>
  );
}

function assistantPurposeLabel(
  purpose: ConsumerFinanceAssistantProposal["operations"][number]["purpose"],
  t: ReturnType<typeof financeAssistantCopy>,
) {
  switch (purpose) {
    case "REIMBURSEMENT":
      return t.reimbursement;
    case "PASS_THROUGH":
      return t.passThrough;
    case "DEBT_REPAYMENT":
      return t.debtRepayment;
    case "INVESTMENT_CONTRIBUTION":
      return t.investmentContribution;
    case "INVESTMENT_RETURN":
      return t.investmentReturn;
    default:
      return t.ordinary;
  }
}

function assistantNecessityLabel(
  necessity: ConsumerFinanceAssistantProposal["operations"][number]["necessity"],
  t: ReturnType<typeof financeAssistantCopy>,
) {
  if (necessity === "REQUIRED") return t.required;
  if (necessity === "DISCRETIONARY") return t.discretionary;
  return t.unspecified;
}
