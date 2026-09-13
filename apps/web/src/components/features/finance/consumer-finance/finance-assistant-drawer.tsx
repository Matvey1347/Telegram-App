"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Paperclip, X } from "lucide-react";
import type {
  ConsumerFinanceAssistantMessage,
  ConsumerFinanceAssistantProposal,
  ConsumerFinanceAssistantScreen,
} from "@telegram-system/shared";
import { consumerFinanceAssistantApi } from "@/lib/features/finance/consumer-finance-assistant-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { Button, Textarea } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeAssistantCopy } from "./i18n/assistant";
import { formatMoney } from "@/lib/features/finance/consumer-finance-money";

export function FinanceAssistantDrawer({
  botId,
  locale,
  onNavigate,
}: {
  botId: string;
  locale: FinanceLocale;
  onNavigate: (screen: ConsumerFinanceAssistantScreen) => void;
}) {
  const t = financeAssistantCopy(locale);
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ConsumerFinanceAssistantMessage[]>(
    [],
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [recommendedScreen, setRecommendedScreen] =
    useState<ConsumerFinanceAssistantScreen | null>(null);
  const [proposal, setProposal] =
    useState<ConsumerFinanceAssistantProposal | null>(null);
  const send = useMutation({
    mutationFn: (input: {
      text: string;
      history: ConsumerFinanceAssistantMessage[];
    }) => consumerFinanceAssistantApi.message(botId, input),
    onSuccess: (result) => {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: result.message },
      ]);
      setProposal(result.proposal ?? null);
      setRecommendedScreen(result.recommendedScreen ?? null);
    },
  });
  const proposeFile = useMutation({
    mutationFn: (file: File) =>
      consumerFinanceAssistantApi.proposeFile(botId, file),
    onSuccess: (result) => {
      setProposal(result);
      setMessages((current) => [
        ...current,
        { role: "user", text: t.attachment },
        { role: "assistant", text: t.proposal },
      ]);
      setRecommendedScreen(null);
    },
  });
  const confirm = useMutation({
    mutationFn: () =>
      consumerFinanceAssistantApi.confirm(botId, proposal!.token),
    onSuccess: () => {
      setProposal(null);
      setNotice(t.saved);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.accounts(botId),
      });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.transactionLists(botId),
      });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.analyticsRoot(botId),
      });
    },
  });
  const cancel = useMutation({
    mutationFn: () =>
      consumerFinanceAssistantApi.cancel(botId, proposal!.token),
    onSuccess: () => {
      setProposal(null);
      setNotice(t.cancelled);
    },
  });
  const pending = send.isPending || proposeFile.isPending;
  const failed = send.isError || proposeFile.isError;

  const sendMessage = () => {
    const value = text.trim();
    if (!value) return;
    const history = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", text: value }]);
    setProposal(null);
    setRecommendedScreen(null);
    setNotice(null);
    setText("");
    send.mutate({ text: value, history });
  };

  return (
    <>
      <button
        type="button"
        aria-label={t.open}
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-sky-500 text-neutral-950 shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-sky-200 md:bottom-6 md:right-6"
      >
        <MessageCircle aria-hidden="true" />
      </button>
      {open ? (
        <aside
          aria-label={t.title}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl"
        >
          <header className="flex items-center justify-between border-b border-neutral-800 p-4">
            <h2 className="text-lg font-semibold">{t.title}</h2>
            <button
              type="button"
              aria-label={t.close}
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 outline-none hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <p className="rounded-xl bg-neutral-900 p-3 text-sm text-neutral-300">
              {t.intro}
            </p>
            {messages.map((message, index) => (
              <p
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "ml-8 whitespace-pre-wrap rounded-xl bg-sky-900/40 p-3 text-sm"
                    : "mr-8 whitespace-pre-wrap rounded-xl border border-sky-900 bg-sky-950/20 p-3 text-sm"
                }
              >
                {message.text}
              </p>
            ))}
            {recommendedScreen ? (
              <Button
                variant="secondary"
                onClick={() => {
                  onNavigate(recommendedScreen);
                  setOpen(false);
                }}
              >
                {t.openRecommended}
              </Button>
            ) : null}
            {proposal ? (
              <div className="space-y-2 rounded-xl border border-amber-800 bg-amber-950/20 p-3">
                <p className="text-sm font-medium text-amber-200">
                  {t.proposal}
                </p>
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
                        {formatMoney(
                          operation.amount,
                          operation.currency,
                          "symbol",
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {operation.accountName}
                      {operation.categoryName
                        ? ` · ${operation.categoryName}`
                        : ""}
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
                        {assistantPurposeLabel(
                          operation.purpose ?? "ORDINARY",
                          t,
                        )}
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
                  <Button
                    disabled={confirm.isPending}
                    onClick={() => confirm.mutate()}
                  >
                    {t.confirm}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate()}
                  >
                    {t.cancel}
                  </Button>
                </div>
              </div>
            ) : null}
            {notice ? (
              <p className="text-sm text-emerald-300">{notice}</p>
            ) : null}
            {pending ? (
              <p className="text-sm text-neutral-400">{t.thinking}</p>
            ) : null}
            {failed || confirm.isError || cancel.isError ? (
              <p role="alert" className="text-sm text-rose-300">
                {t.error}
              </p>
            ) : null}
          </div>
          <div className="space-y-2 border-t border-neutral-800 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Textarea
              aria-label={t.placeholder}
              maxLength={2000}
              value={text}
              placeholder={t.placeholder}
              onChange={(event) => setText(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending || text.trim().length < 3}
                onClick={sendMessage}
              >
                {t.send}
              </Button>
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => fileInput.current?.click()}
              >
                <Paperclip aria-hidden="true" size={16} /> {t.attach}
              </Button>
              <input
                ref={fileInput}
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,audio/ogg,audio/mpeg,audio/mp4,audio/wav,audio/webm"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) proposeFile.mutate(file);
                  event.currentTarget.value = "";
                }}
              />
            </div>
          </div>
        </aside>
      ) : null}
    </>
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
