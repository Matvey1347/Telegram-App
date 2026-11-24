"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import type {
  ConsumerFinanceAssistantMessage,
  ConsumerFinanceAssistantChatMode,
  ConsumerFinanceAssistantMessageInput,
  ConsumerFinanceAssistantProposal,
  ConsumerFinanceAssistantScreen,
} from "@telegram-system/shared";
import { consumerFinanceAssistantApi, FinanceAssistantRequestError } from "@consumer-finance/web/lib/api/consumer-finance-assistant-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import { Button } from "@consumer-finance/web/components/ui";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeAssistantCopy, groshlyAssistantCopy } from "@consumer-finance/web/components/i18n/assistant";
import { useFinanceAssistantMedia } from "@consumer-finance/web/components/hooks/use-finance-assistant-media";
import { useGroshlyDictation } from "@consumer-finance/web/components/hooks/use-groshly-dictation";
import {
  AssistantBubble,
  AssistantProposalCard,
} from "@consumer-finance/web/components/assistant/finance-assistant-message-content";
import { GroshlyAssistantError, GroshlyAssistantProgress } from "./groshly-assistant-feedback";
import { FinanceAssistantMessageActions } from "./finance-assistant-message-actions";
import { FinanceAssistantComposer } from "@consumer-finance/web/components/assistant/finance-assistant-composer";
import {
  FinancePlanPromotion,
  FinanceTierBadge,
} from "@consumer-finance/web/components/planning/finance-plan-promotion";
import { useFinanceEntitlements } from "@consumer-finance/web/components/hooks/use-finance-entitlements";

type ChatMessage = ConsumerFinanceAssistantMessage & { id?: string; replyTo?: ConsumerFinanceAssistantMessage };
type Conversation = {
  id: string;
  mode: ConsumerFinanceAssistantChatMode;
  initialMessages: ChatMessage[];
  olderMessages: ChatMessage[];
  loadEarlier?: () => void;
  loadingEarlier: boolean;
  loadEarlierLabel: string;
  onChanged: () => void;
};

type LastRequest =
  | {
      kind: "message";
      text: string;
      history: ConsumerFinanceAssistantMessage[];
      replyTo?: ConsumerFinanceAssistantMessage;
      turnId?: string;
    }
  | { kind: "files"; files: File[]; turnId?: string };

export function FinanceAssistantDrawer({
  botId,
  locale,
  timezone = "UTC",
  open,
  onOpenChange,
  onNavigate,
  presentation = "drawer",
  onLedgerChange,
  conversation,
  createConversation,
}: {
  botId: string;
  locale: FinanceLocale;
  timezone?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (screen: ConsumerFinanceAssistantScreen) => void;
  presentation?: "drawer" | "page" | "groshly";
  onLedgerChange?: () => void;
  conversation?: Conversation;
  createConversation?: (title: string, signal: AbortSignal) => Promise<string>;
}) {
  const isGroshly = presentation === "groshly";
  const isPage = presentation !== "drawer";
  const allowAttachments = conversation?.mode !== "ADVICE";
  const t = isGroshly ? groshlyAssistantCopy(locale) : financeAssistantCopy(locale);
  const client = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const followReply = useRef(true);
  const activeStream = useRef<AbortController | null>(null);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ConsumerFinanceAssistantMessage | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [streamCancelled, setStreamCancelled] = useState(false);
  const [thinkingStage, setThinkingStage] = useState(0);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [localMessages, setMessages] = useState<ChatMessage[] | null>(null);
  const messages = localMessages ?? conversation?.initialMessages;
  const appendMessage = (message: ChatMessage) =>
    setMessages((current) => [...(current ?? conversation?.initialMessages ?? []), message]);
  const turnIdentity = async (title: string, signal: AbortSignal, turnId?: string) => {
    if (!turnId) return undefined;
    const chatId = conversation?.id ?? await createConversation?.(title, signal);
    signal.throwIfAborted();
    return chatId ? { chatId, turnId } : undefined;
  };
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
  const dictation = useGroshlyDictation({
    enabled: isGroshly && open && voiceAllowed && !quotaExhausted,
    locale,
    onCommit: setText,
  });
  const canAttach = allowAttachments && dictation.phase === "idle";
  const usageLabel = useMemo(() => {
    if (!entitlements.data || !aiUsage) return null;
    if (aiUsage.limit === null) return t.unlimited;
    return t.requestsLeft.replace("{count}", String(aiUsage.remaining ?? 0));
  }, [aiUsage, entitlements.data, t.requestsLeft, t.unlimited]);

  const send = useMutation({
    mutationFn: async ({ turnId, ...input }: ConsumerFinanceAssistantMessageInput) => {
      const controller = new AbortController();
      activeStream.current = controller;
      setStreamCancelled(false);
      const identity = await turnIdentity(input.text, controller.signal, turnId);
      return consumerFinanceAssistantApi.message(botId, { ...input, ...identity }, {
        signal: controller.signal,
        onDelta: (delta) => setStreamingText((current) => current + delta),
        onProgress: ({ stage, completed, total }) => {
          setThinkingStage(
            stage === "UNDERSTANDING" ? 0 : stage === "PREPARING" ? 1 : 2,
          );
          setProgress({ completed, total });
        },
      });
    },
    onSuccess: (result) => {
      appendMessage({
        role: "assistant",
        text: result.proposal && !result.message
          ? t.preparedProposal.replace("{count}", String(result.proposal.operations.length))
          : result.message,
      });
      setProposal(result.proposal ?? null);
      setRecommendedScreen(result.recommendedScreen ?? null);
      setStreamingText("");
      setLastRequest(null);
      void entitlements.refetch();
    },
    onError: () => {
      const aborted = activeStream.current?.signal.aborted;
      if (!isGroshly || aborted) setStreamingText("");
      if (aborted) setStreamCancelled(true);
    },
    onSettled: () => {
      activeStream.current = null;
      conversation?.onChanged();
    },
  });
  const proposeFiles = useMutation({
    mutationFn: async ({ files, turnId }: Extract<LastRequest, { kind: "files" }>) => {
      const controller = new AbortController();
      activeStream.current = controller;
      const identity = await turnIdentity(files[0]?.name ?? "", controller.signal, turnId);
      return identity
        ? consumerFinanceAssistantApi.proposeFiles(botId, files, identity, controller.signal)
        : consumerFinanceAssistantApi.proposeFiles(botId, files);
    },
    onSuccess: (result) => {
      setProposal(result);
      appendMessage({ role: "assistant", text: t.proposal });
      setRecommendedScreen(null);
      setLastRequest(null);
      media.clearAttachments();
      void entitlements.refetch();
    },
    onSettled: () => {
      activeStream.current = null;
      conversation?.onChanged();
    },
  });
  const confirm = useMutation({
    mutationFn: () =>
      consumerFinanceAssistantApi.confirm(botId, proposal!.token),
    onSuccess: () => {
      setProposal(null);
      setNotice(t.saved);
      onLedgerChange?.();
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
  const revise = useMutation({
    mutationFn: ({ operations, keepIndices }: {
      operations: ConsumerFinanceAssistantProposal["operations"];
      keepIndices?: number[];
    }) =>
      consumerFinanceAssistantApi.revise(
        botId,
        proposal!.token,
        operations.map((operation) => ({
          amount: operation.amount,
          economicAmount: operation.economicAmount,
          accountId: operation.accountId,
          categoryId: operation.categoryId,
          description: operation.description,
          occurredAt: operation.occurredAt,
          purpose:
            operation.purpose === "INVESTMENT_CONTRIBUTION" ||
            operation.purpose === "INVESTMENT_RETURN"
              ? undefined
              : operation.purpose,
          necessity: operation.necessity,
        })),
        keepIndices,
      ),
    onSuccess: (_result, { operations }) => setProposal((current) =>
      current ? { ...current, operations } : current,
    ),
  });
  const pending = send.isPending || proposeFiles.isPending;
  const failed =
    (send.isError && !streamCancelled) ||
    proposeFiles.isError;

  const assistantError =
    send.error instanceof FinanceAssistantRequestError && send.error.code === "BadGatewayException"
      ? t.providerError
      : t.error;

  useEffect(() => {
    if (!open) return;
    if (isGroshly) {
      if (followReply.current && transcript.current)
        transcript.current.scrollTop = transcript.current.scrollHeight;
      return;
    }
    messageEnd.current?.scrollIntoView?.({ block: "end" });
  }, [isGroshly, messages, open, pending, proposal, streamingText]);

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
    setProgress(null);
    setThinkingStage(0);
    send.reset();
    proposeFiles.reset();
  };

  const sendRequest = (request: LastRequest) => {
    if (request.kind === "files") {
      proposeFiles.mutate(request);
      return;
    }
    send.mutate({ text: request.text, history: request.history, replyTo: request.replyTo, turnId: request.turnId });
  };

  const sendCurrent = (dictatedText?: string) => {
    const value = (dictatedText ?? text).trim();
    const files = allowAttachments ? [...media.files] : [];
    if (pending || (dictatedText === undefined && dictation.phase !== "idle") || (!value && !files.length)) return;
    followReply.current = true;
    resetTransientState();
    const turnId = conversation || createConversation ? crypto.randomUUID() : undefined;
    const quotedMessage = replyTo ? { role: replyTo.role, text: replyTo.text.slice(0, 1200) } : undefined;
    const request: LastRequest = files.length
      ? { kind: "files", files, turnId }
      : {
          kind: "message", text: value, turnId, replyTo: quotedMessage,
          history: conversation || createConversation ? [] : (messages ?? []).slice(-8)
            .map((item) => ({ role: item.role, text: item.text.trim().slice(0, 1200) }))
            .filter((item) => item.text),
        };
    appendMessage({ role: "user", text: files.length ? files.map((file) => file.name).join(", ") : value, replyTo: quotedMessage });
    setReplyTo(null);
    if (!files.length) setText("");
    setLastRequest(request);
    sendRequest(request);
  };

  const retry = () => {
    if (!lastRequest || pending) return;
    followReply.current = true;
    resetTransientState();
    sendRequest(lastRequest);
  };

  const stop = () => {
    if (streamingText) appendMessage({ role: "assistant", text: streamingText });
    setStreamCancelled(true);
    setStreamingText("");
    activeStream.current?.abort();
  };

  const allMessages = [...(conversation?.olderMessages ?? []), ...(messages ?? [])];

  return (
    <>
      {open ? (
        <aside
          aria-label={t.title}
          role={isPage ? "region" : "complementary"}
          data-finance-assistant-presentation={presentation}
          onDragEnter={(event) => {
            event.preventDefault();
            if (canAttach) media.setDragActive(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              media.setDragActive(false);
          }}
          onDrop={canAttach ? media.onDrop : (event) => event.preventDefault()}
          className={
            isGroshly ? "groshly-assistant" : isPage
              ? "relative mx-auto flex h-[calc(100dvh-11rem)] min-h-[28rem] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 shadow-xl md:h-[calc(100dvh-8.5rem)]"
              : "fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-neutral-950 shadow-2xl sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(680px,calc(100dvh-3rem))] sm:w-[410px] sm:rounded-3xl sm:border sm:border-neutral-700 sm:bg-neutral-950/98 sm:backdrop-blur-xl"
          }
        >
          {canAttach && media.dragActive ? (
            <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-2xl border-2 border-dashed border-cyan-400 bg-cyan-950/90 text-sm font-medium text-cyan-100">
              {t.dropHere}
            </div>
          ) : null}
          {!isGroshly && <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
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
          </header>}

          <div ref={transcript} onScroll={isGroshly ? (event) => {
            const { scrollHeight, scrollTop, clientHeight } = event.currentTarget;
            followReply.current = scrollHeight - scrollTop - clientHeight <= 48;
          } : undefined} role={isGroshly ? "log" : undefined} aria-live={isGroshly && pending ? "off" : undefined} className={isGroshly ? "groshly-assistant-messages" : "min-h-0 flex-1 space-y-3 overflow-y-auto p-4 [scrollbar-color:#3a3a3a_transparent] [scrollbar-width:thin]"}>
            {conversation?.loadEarlier && <button type="button" className="groshly-chat-earlier"
              disabled={conversation.loadingEarlier} onClick={() => {
                followReply.current = false;
                conversation.loadEarlier?.();
              }}>{conversation.loadEarlierLabel}</button>}
            {(!isGroshly || !allMessages.length) && <AssistantBubble groshly={isGroshly}>{t.intro}</AssistantBubble>}
            {allMessages.map((message, index) =>
              isGroshly ? (
                <FinanceAssistantMessageActions
                  key={message.id ?? index}
                  message={message}
                  t={t}
                  onReply={() => setReplyTo(message)}
                />
              ) : message.role === "user" ? (
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
            {isGroshly && ((pending && !streamCancelled) || (failed && streamingText)) ? (
              <GroshlyAssistantProgress
                text={streamingText}
                waitingLabel={t.thinking}
                stopLabel={t.stop}
                onStop={send.isPending ? stop : undefined}
              />
            ) : null}
            {!isGroshly && send.isPending && streamingText ? (
              <AssistantBubble groshly={isGroshly}>
                {streamingText}
                <span
                  aria-hidden="true"
                  className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-cyan-300 align-text-bottom motion-reduce:animate-none"
                />
                <Button variant="cancel" className="ml-2 !px-2 !py-1 text-xs" onClick={() => activeStream.current?.abort()}>{t.stop}</Button>
              </AssistantBubble>
            ) : null}
            {!isGroshly && pending && (!send.isPending || !streamingText) ? (
              <AssistantBubble groshly={isGroshly}>
                <span className="inline-flex items-center gap-2 text-neutral-400">
                  <span className="relative inline-flex size-5 shrink-0" role="progressbar" aria-label={t.thinking} aria-valuemin={0} aria-valuemax={progress?.total ?? 3} aria-valuenow={progress?.completed ?? 0}>
                    <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" className="text-neutral-700" />
                      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-cyan-300 transition-all duration-300" strokeDasharray={`${progress ? 56.55 * progress.completed / progress.total : 0} 56.55`} />
                    </svg>
                    <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-100 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  </span>
                  {t.thinkingStages[thinkingStage] ?? t.thinking}
                </span>
                <Button variant="cancel" className="ml-2 !px-2 !py-1 text-xs" onClick={() => activeStream.current?.abort()}>{t.stop}</Button>
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
                botId={botId}
                locale={locale}
                timezone={timezone}
                compact={!isPage}
                t={t}
                confirming={confirm.isPending}
                cancelling={cancel.isPending}
                revising={revise.isPending}
                onConfirm={() => confirm.mutateAsync().then(() => undefined)}
                onCancel={() => cancel.mutateAsync().then(() => undefined)}
                onRevise={(operations, keepIndices) =>
                  revise.mutateAsync({ operations, keepIndices }).then(() => undefined)
                }
              />
            ) : null}
            {notice ? (
              <p className="text-sm text-emerald-300">{notice}</p>
            ) : null}
            {failed || confirm.isError || cancel.isError || revise.isError ? (
              isGroshly ? (
                <GroshlyAssistantError message={assistantError} retryLabel={t.retry} onRetry={lastRequest ? retry : undefined} />
              ) : <div
                role="alert"
                className="rounded-xl border border-rose-900 bg-rose-950/25 p-3 text-sm text-rose-200"
              >
                <p>{assistantError}</p>
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
            <div className={isGroshly ? "groshly-assistant-paywall" : "border-t border-neutral-800 p-3"}>
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
          ) : !isGroshly && !entitlements.isLoading &&
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

          {(!isGroshly || !quotaExhausted) && <FinanceAssistantComposer
            t={t}
            media={media}
            groshly={isGroshly}
            dictation={isGroshly ? dictation : undefined}
            replyTo={replyTo?.text}
            onClearReply={() => setReplyTo(null)}
            text={text}
            pending={pending}
            voiceAllowed={voiceAllowed}
            allowAttachments={allowAttachments}
            fileInput={fileInput}
            onTextChange={setText}
            onSend={sendCurrent}
            onUpgrade={() => onNavigate("billing")}
          />}
        </aside>
      ) : null}
    </>
  );
}
