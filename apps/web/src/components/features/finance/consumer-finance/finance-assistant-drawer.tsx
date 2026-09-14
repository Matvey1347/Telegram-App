"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, LoaderCircle, X } from "lucide-react";
import type {
  ConsumerFinanceAssistantMessage,
  ConsumerFinanceAssistantProposal,
  ConsumerFinanceAssistantScreen,
} from "@telegram-system/shared";
import { consumerFinanceAssistantApi } from "@/lib/features/finance/consumer-finance-assistant-api";
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
import {
  FinancePlanPromotion,
  FinanceTierBadge,
} from "./finance-plan-promotion";
import { useFinanceEntitlements } from "./use-finance-entitlements";

type LastRequest =
  | {
      kind: "message";
      text: string;
      history: ConsumerFinanceAssistantMessage[];
    }
  | { kind: "files"; files: File[] };

export function FinanceAssistantDrawer({
  botId,
  locale,
  open,
  onOpenChange,
  onNavigate,
  presentation = "drawer",
}: {
  botId: string;
  locale: FinanceLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (screen: ConsumerFinanceAssistantScreen) => void;
  presentation?: "drawer" | "page";
}) {
  const isPage = presentation === "page";
  const t = financeAssistantCopy(locale);
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const activeStream = useRef<AbortController | null>(null);
  const [text, setText] = useState("");
  const [streamingText, setStreamingText] = useState("");
  const [streamCancelled, setStreamCancelled] = useState(false);
  const [messages, setMessages] = useState<ConsumerFinanceAssistantMessage[]>(
    [],
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [voiceOfferDismissed, setVoiceOfferDismissed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(`finance-jarvis-voice-offer:${botId}`) ===
        "dismissed",
  );
  const [lastRequest, setLastRequest] = useState<LastRequest | null>(null);
  const [recommendedScreen, setRecommendedScreen] =
    useState<ConsumerFinanceAssistantScreen | null>(null);
  const [proposal, setProposal] =
    useState<ConsumerFinanceAssistantProposal | null>(null);
  const media = useFinanceAssistantMedia();
  const entitlements = useFinanceEntitlements(botId, open);
  const aiUsage = entitlements.data?.usage.find(
    (item) => item.feature === "AI_INPUT",
  );
  const voiceAllowed =
    entitlements.data?.capabilities.includes("VOICE_INPUT") ?? false;
  const quotaExhausted = aiUsage?.remaining === 0;
  const usageLabel = useMemo(() => {
    if (!entitlements.data || !aiUsage) return null;
    if (aiUsage.limit === null) return t.unlimited;
    return t.requestsLeft.replace("{count}", String(aiUsage.remaining ?? 0));
  }, [aiUsage, entitlements.data, t.requestsLeft, t.unlimited]);

  const send = useMutation({
    mutationFn: (input: {
      text: string;
      history: ConsumerFinanceAssistantMessage[];
    }) => {
      const controller = new AbortController();
      activeStream.current = controller;
      setStreamCancelled(false);
      return consumerFinanceAssistantApi.message(botId, input, {
        signal: controller.signal,
        onDelta: (delta) => setStreamingText((current) => current + delta),
      });
    },
    onSuccess: (result) => {
      setMessages((current) => [
        ...current,
        { role: "assistant", text: result.message },
      ]);
      setProposal(result.proposal ?? null);
      setRecommendedScreen(result.recommendedScreen ?? null);
      setStreamingText("");
      setLastRequest(null);
      void entitlements.refetch();
    },
    onError: () => setStreamingText(""),
    onSettled: () => {
      activeStream.current = null;
    },
  });
  const proposeFiles = useMutation({
    mutationFn: (files: File[]) =>
      consumerFinanceAssistantApi.proposeFiles(botId, files),
    onSuccess: (result) => {
      setProposal(result);
      setMessages((current) => [
        ...current,
        { role: "assistant", text: t.proposal },
      ]);
      setRecommendedScreen(null);
      setLastRequest(null);
      media.clearAttachments();
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
  const pending = send.isPending || proposeFiles.isPending;
  const failed = (send.isError && !streamCancelled) || proposeFiles.isError;

  useEffect(() => {
    if (open) messageEnd.current?.scrollIntoView?.({ block: "end" });
  }, [messages, open, pending, proposal, streamingText]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      activeStream.current?.abort();
      activeStream.current = null;
      setStreamCancelled(true);
      setStreamingText("");
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      activeStream.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (open) return;
    activeStream.current?.abort();
    activeStream.current = null;
  }, [open]);

  const resetTransientState = () => {
    setProposal(null);
    setRecommendedScreen(null);
    setNotice(null);
    setStreamingText("");
    setStreamCancelled(false);
    send.reset();
    proposeFiles.reset();
  };

  const sendCurrent = () => {
    if (pending) return;
    resetTransientState();
    if (media.files.length) {
      const files = [...media.files];
      const request = { kind: "files" as const, files };
      setMessages((current) => [
        ...current,
        {
          role: "user",
          text: `${t.attachment}: ${files.map((file) => file.name).join(", ")}`,
        },
      ]);
      setLastRequest(request);
      proposeFiles.mutate(request.files);
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
    setStreamingText("");
    proposeFiles.reset();
    if (lastRequest.kind === "files") proposeFiles.mutate(lastRequest.files);
    else send.mutate({ text: lastRequest.text, history: lastRequest.history });
  };

  return (
    <>
      {open ? (
        <aside
          aria-label={t.title}
          role={isPage ? "region" : "complementary"}
          data-finance-assistant-presentation={presentation}
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
          className={
            isPage
              ? "relative mx-auto flex h-[calc(100dvh-11rem)] min-h-[28rem] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 shadow-xl md:h-[calc(100dvh-8.5rem)]"
              : "fixed inset-x-0 bottom-0 z-50 flex h-[min(82dvh,720px)] flex-col overflow-hidden rounded-t-3xl border border-neutral-700 bg-neutral-950/98 shadow-2xl backdrop-blur-xl sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-3rem))] sm:w-[410px] sm:rounded-3xl"
          }
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
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate font-semibold text-neutral-100">
                  {t.title}
                </h2>
                <FinanceTierBadge
                  tier={entitlements.data?.tier}
                  loading={entitlements.isLoading}
                />
              </div>
              <p className="truncate text-xs text-cyan-300">
                {usageLabel ?? t.subtitle}
              </p>
            </div>
            {!isPage ? (
              <button
                type="button"
                aria-label={t.close}
                onClick={() => {
                  activeStream.current?.abort();
                  activeStream.current = null;
                  setStreamCancelled(true);
                  setStreamingText("");
                  onOpenChange(false);
                }}
                className="grid h-10 w-10 place-items-center rounded-xl outline-none hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-sky-300"
              >
                <X aria-hidden="true" size={20} />
              </button>
            ) : null}
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
            {send.isPending && streamingText ? (
              <AssistantBubble>
                {streamingText}
                <span
                  aria-hidden="true"
                  className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-cyan-300 align-text-bottom motion-reduce:animate-none"
                />
              </AssistantBubble>
            ) : null}
            {pending && (!send.isPending || !streamingText) ? (
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
                  activeStream.current?.abort();
                  activeStream.current = null;
                  setStreamCancelled(true);
                  setStreamingText("");
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
                </div>
              </div>
            ) : null}
            <div ref={messageEnd} />
          </div>

          {quotaExhausted ? (
            <div className="border-t border-neutral-800 p-3">
              <FinancePlanPromotion
                compact
                eyebrow={t.planEyebrow}
                title={t.limitUpgradeTitle}
                description={t.limitUpgradeDescription}
                cta={t.limitUpgradeCta}
                tier="PRO"
                onUpgrade={() => onNavigate("billing")}
              />
            </div>
          ) : !entitlements.isLoading &&
            !voiceAllowed &&
            !voiceOfferDismissed ? (
            <div className="border-t border-neutral-800 p-3">
              <FinancePlanPromotion
                compact
                eyebrow={t.planEyebrow}
                title={t.voiceUpgradeTitle}
                description={t.voiceUpgradeDescription}
                cta={t.voiceUpgradeCta}
                tier="PRO"
                onUpgrade={() => onNavigate("billing")}
                dismissLabel={t.dismissUpgrade}
                onDismiss={() => {
                  setVoiceOfferDismissed(true);
                  window.localStorage.setItem(
                    `finance-jarvis-voice-offer:${botId}`,
                    "dismissed",
                  );
                }}
              />
            </div>
          ) : null}

          <FinanceAssistantComposer
            t={t}
            media={media}
            text={text}
            pending={pending}
            voiceAllowed={voiceAllowed}
            fileInput={fileInput}
            onTextChange={setText}
            onSend={sendCurrent}
            onUpgrade={() => onNavigate("billing")}
          />
        </aside>
      ) : null}
    </>
  );
}
