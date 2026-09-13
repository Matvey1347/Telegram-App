"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, LoaderCircle, X } from "lucide-react";
import type {
  ConsumerFinanceAssistantMessage,
  ConsumerFinanceAssistantProposal,
  ConsumerFinanceAssistantScreen,
} from "@telegram-system/shared";
import { consumerFinanceAssistantApi } from "@/lib/features/finance/consumer-finance-assistant-api";
import { consumerFinancePlanningApi } from "@/lib/features/finance/consumer-finance-planning-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { Button } from "./ui";
import type { FinanceLocale } from "./i18n/core";
import { financeAssistantCopy } from "./i18n/assistant";
import { useFinanceAssistantMedia } from "./use-finance-assistant-media";
import {
  AssistantBubble,
  AssistantProposalCard,
} from "./finance-assistant-message-content";
import { FinanceAssistantComposer } from "./finance-assistant-composer";

type LastRequest =
  | {
      kind: "message";
      text: string;
      history: ConsumerFinanceAssistantMessage[];
    }
  | { kind: "file"; file: File };

export function FinanceAssistantDrawer({
  botId,
  locale,
  open,
  onOpenChange,
  onNavigate,
}: {
  botId: string;
  locale: FinanceLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (screen: ConsumerFinanceAssistantScreen) => void;
}) {
  const t = financeAssistantCopy(locale);
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<ConsumerFinanceAssistantMessage[]>(
    [],
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<LastRequest | null>(null);
  const [recommendedScreen, setRecommendedScreen] =
    useState<ConsumerFinanceAssistantScreen | null>(null);
  const [proposal, setProposal] =
    useState<ConsumerFinanceAssistantProposal | null>(null);
  const media = useFinanceAssistantMedia();
  const entitlements = useQuery({
    queryKey: consumerFinanceKeys.entitlements(botId),
    queryFn: () => consumerFinancePlanningApi.entitlements(botId),
    enabled: open,
    staleTime: 60_000,
  });
  const aiUsage = entitlements.data?.usage.find(
    (item) => item.feature === "AI_INPUT",
  );
  const voiceAllowed =
    entitlements.data?.capabilities.includes("VOICE_INPUT") ?? false;
  const usageLabel = useMemo(() => {
    if (!entitlements.data || !aiUsage) return null;
    if (aiUsage.limit === null) return t.unlimited;
    return t.requestsLeft.replace("{count}", String(aiUsage.remaining ?? 0));
  }, [aiUsage, entitlements.data, t.requestsLeft, t.unlimited]);

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
      setLastRequest(null);
      void entitlements.refetch();
    },
  });
  const proposeFile = useMutation({
    mutationFn: (file: File) =>
      consumerFinanceAssistantApi.proposeFile(botId, file),
    onSuccess: (result) => {
      setProposal(result);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: t.proposal },
      ]);
      setRecommendedScreen(null);
      setLastRequest(null);
      media.selectFile(null);
      void entitlements.refetch();
    },
  });
  const confirm = useMutation({
    mutationFn: () =>
      consumerFinanceAssistantApi.confirm(botId, proposal!.token),
    onSuccess: () => {
      setProposal(null);
      setNotice(t.saved);
      void Promise.all([
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.dashboard(botId),
        }),
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.accounts(botId),
        }),
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.transactionLists(botId),
        }),
        client.invalidateQueries({
          queryKey: consumerFinanceKeys.analyticsRoot(botId),
        }),
      ]);
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

  useEffect(() => {
    if (open) messageEnd.current?.scrollIntoView?.({ block: "end" });
  }, [messages, open, pending, proposal]);

  const resetTransientState = () => {
    setProposal(null);
    setRecommendedScreen(null);
    setNotice(null);
    send.reset();
    proposeFile.reset();
  };

  const sendCurrent = () => {
    if (pending) return;
    resetTransientState();
    if (media.file) {
      const request = { kind: "file" as const, file: media.file };
      setMessages((current) => [
        ...current,
        { role: "user", text: `${t.attachment}: ${media.file!.name}` },
      ]);
      setLastRequest(request);
      proposeFile.mutate(request.file);
      return;
    }
    const value = text.trim();
    if (!value) return;
    const history = messages.slice(-8);
    setMessages((current) => [...current, { role: "user", text: value }]);
    setText("");
    const request = { kind: "message" as const, text: value, history };
    setLastRequest(request);
    send.mutate({ text: request.text, history: request.history });
  };

  const retry = () => {
    if (!lastRequest || pending) return;
    send.reset();
    proposeFile.reset();
    if (lastRequest.kind === "file") proposeFile.mutate(lastRequest.file);
    else
      send.mutate({ text: lastRequest.text, history: lastRequest.history });
  };

  return (
    <>
      {open ? (
        <aside
          aria-label={t.title}
          onDragEnter={(event) => {
            event.preventDefault();
            media.setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              media.setDragActive(false);
          }}
          onDrop={media.onDrop}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[min(82dvh,720px)] flex-col overflow-hidden rounded-t-3xl border border-neutral-700 bg-neutral-950/98 shadow-2xl backdrop-blur-xl sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-3rem))] sm:w-[410px] sm:rounded-3xl"
        >
          {media.dragActive ? (
            <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-cyan-400 bg-cyan-950/90 text-sm font-medium text-cyan-100">
              {t.dropHere}
            </div>
          ) : null}
          <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
            <Image
              src="/finance/assistant/jarvis-v1.webp"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 rounded-full border border-cyan-400/25 bg-cyan-950/30 object-cover"
            />
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold text-neutral-100">
                {t.title}
              </h2>
              <p className="truncate text-xs text-cyan-300">
                {usageLabel ?? t.subtitle}
              </p>
            </div>
            <button
              type="button"
              aria-label={t.close}
              onClick={() => onOpenChange(false)}
              className="grid h-10 w-10 place-items-center rounded-xl outline-none hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              <X aria-hidden="true" size={20} />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 [scrollbar-color:#3a3a3a_transparent] [scrollbar-width:thin]">
            <AssistantBubble>{t.intro}</AssistantBubble>
            {!messages.length ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/55 p-4 text-center">
                <Bot className="mx-auto text-cyan-300" size={24} />
                <p className="mt-2 text-sm text-neutral-300">{t.ready}</p>
              </div>
            ) : null}
            {messages.map((message, index) =>
              message.role === "user" ? (
                <p
                  key={`${message.role}-${index}`}
                  className="ml-10 whitespace-pre-wrap rounded-2xl rounded-br-md bg-cyan-900/45 px-3.5 py-2.5 text-sm text-neutral-100"
                >
                  {message.text}
                </p>
              ) : (
                <AssistantBubble key={`${message.role}-${index}`}>
                  {message.text}
                </AssistantBubble>
              ),
            )}
            {pending ? (
              <AssistantBubble>
                <span className="inline-flex items-center gap-2 text-neutral-400">
                  <LoaderCircle
                    className="animate-spin motion-reduce:animate-none"
                    size={15}
                  />
                  {t.thinking}
                </span>
              </AssistantBubble>
            ) : null}
            {recommendedScreen ? (
              <Button
                variant="secondary"
                onClick={() => {
                  onNavigate(recommendedScreen);
                  onOpenChange(false);
                }}
              >
                {t.openRecommended}
              </Button>
            ) : null}
            {proposal ? (
              <AssistantProposalCard
                proposal={proposal}
                t={t}
                confirming={confirm.isPending}
                cancelling={cancel.isPending}
                onConfirm={() => confirm.mutate()}
                onCancel={() => cancel.mutate()}
              />
            ) : null}
            {notice ? (
              <p className="text-sm text-emerald-300">{notice}</p>
            ) : null}
            {failed || confirm.isError || cancel.isError ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-900 bg-rose-950/25 p-3 text-sm text-rose-200"
              >
                <p>{t.error}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {lastRequest ? (
                    <Button variant="secondary" onClick={retry}>
                      {t.retry}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={() => onNavigate("billing")}
                  >
                    {t.openPlans}
                  </Button>
                </div>
              </div>
            ) : null}
            <div ref={messageEnd} />
          </div>

          <FinanceAssistantComposer
            t={t}
            media={media}
            text={text}
            pending={pending}
            voiceAllowed={voiceAllowed}
            fileInput={fileInput}
            onTextChange={setText}
            onSend={sendCurrent}
            onOpenPlans={() => onNavigate("billing")}
          />
        </aside>
      ) : null}
    </>
  );
}
