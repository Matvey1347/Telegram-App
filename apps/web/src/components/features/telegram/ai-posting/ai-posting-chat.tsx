"use client";

import type {
  TelegramAiPostingChatMessage,
  TelegramAiPostingChatReply,
} from "@telegram-system/shared";
import { useCallback, useState, type ReactNode } from "react";
import { ArrowUp, MessageSquareReply, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/primitives";
import { Textarea } from "@/components/ui/primitives";
import { AiPostingChatPublication } from "./ai-posting-chat-publication";
import { AiPostingChatAttachments } from "./ai-posting-chat-attachments";
import { aiPostingTestRunKeys, resolveTestConsoleError } from "./ai-posting-test-console-model";

type ActionResult = { kind: string; status: string; message: string };
type CurrentPublication = { runId: string; version: number; index: number };
type RevisedPublication = { runId: string; version: number; publication: { title: string; text: string; imageUrl?: string | null } };
type ChatReply = TelegramAiPostingChatReply & {
  actions?: ActionResult[];
  suggestedTopic?: string | null;
  revisedPublication?: RevisedPublication | null;
};
type Message = TelegramAiPostingChatMessage & {
  id?: string;
  replyToMessageId?: string | null;
  suggestedTopic?: string | null;
};
type ImageAnalysis = {
  id: string;
  kind: "image";
  name: string;
  analysis: string;
};
type AudioAnalysis = {
  id: string;
  kind: "audio";
  name: string;
  transcript: string;
  durationSeconds: number;
};
type AttachmentAnalysis = ImageAnalysis | AudioAnalysis;

export function AiPostingChat({
  channelId,
  active,
  settingsReady = true,
}: {
  channelId: string;
  active: boolean;
  settingsReady?: boolean;
}) {
  const client = useQueryClient();
  const historyKey = ["telegram-ai-posting", channelId, "chat"] as const;
  const history = useQuery({
    queryKey: historyKey,
    enabled: active,
    queryFn: async () =>
      (await api.get(`/telegram-channels/${channelId}/ai-posting/chat`))
        .data as Message[],
  });
  const messages = history.data ?? [];
  const [value, setValue] = useState("");
  const [suggestedTopic, setSuggestedTopic] = useState<
    string | null | undefined
  >(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<AttachmentAnalysis | null>(null);
  const [recording, setRecording] = useState(false);
  const [publication, setPublication] = useState<CurrentPublication | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [revisedPublication, setRevisedPublication] = useState<RevisedPublication | null>(null);
  const [generateAction, setGenerateAction] = useState<ReactNode>(null);
  const updateGenerateAction = useCallback((action: ReactNode) => setGenerateAction(action), []);
  const reply = useMutation({
    mutationFn: async (history: Message[]) => {
      const last = history[history.length - 1].text;
      let attachment: AttachmentAnalysis | null = null;
      if (file) {
        let analysis = uploaded;
        if (!analysis) {
          const body = new FormData();
          body.set(
            "file",
            file.type === "audio/x-wav"
              ? new File([file], file.name, { type: "audio/wav" })
              : file,
          );
          analysis = (
            await api.post(
              `/telegram-channels/${channelId}/ai-posting/chat/attachments`,
              body,
            )
          ).data as AttachmentAnalysis;
          if (
            !analysis ||
            typeof analysis.id !== "string" ||
            !analysis.id ||
            typeof analysis.name !== "string" ||
            (analysis.kind === "image" &&
              typeof analysis.analysis !== "string") ||
            (analysis.kind === "audio" &&
              (typeof analysis.transcript !== "string" ||
                !analysis.transcript.trim())) ||
            !["image", "audio"].includes(analysis.kind)
          )
            throw new Error("ATTACHMENT_INVALID");
          setUploaded(analysis);
        }
        attachment = analysis;
      }
      if (last.length > 4000) throw new Error("MESSAGE_TOO_LONG");
      const messages = [
        ...history.slice(0, -1),
        { role: "user" as const, text: last },
      ];
      const result = (
        await api.post(`/telegram-channels/${channelId}/ai-posting/chat`, {
          messages,
          ...(attachment ? { attachmentIds: [attachment.id] } : {}),
          ...(publication ? { publication } : {}),
          ...(replyTarget?.id ? { replyToMessageId: replyTarget.id } : {}),
        })
      ).data as ChatReply;
      return {
        result,
        message: messages[messages.length - 1],
      };
    },
    onSuccess: async ({ result, message }) => {
      client.setQueryData<Message[]>(historyKey, (current) =>
        [
          ...(current ?? []),
          message,
          {
            role: "assistant" as const,
            text: result.reply,
          suggestedTopic: result.suggestedTopic ?? undefined,
          },
        ].slice(-100),
      );
      setSuggestedTopic(result.suggestedTopic ?? null);
      if (result.revisedPublication) {
        setRevisedPublication(result.revisedPublication);
        setPublication({ runId: result.revisedPublication.runId, version: result.revisedPublication.version, index: 0 });
      }
      setValue("");
      setReplyTarget(null);
      setFile(null);
      setUploaded(null);
      await client.invalidateQueries({ queryKey: historyKey });
      const changed = result.actions?.some(
        (action) => action.status.toLowerCase() === "completed",
      );
      if (result.revisedPublication && !changed)
        await client.invalidateQueries({ queryKey: aiPostingTestRunKeys(channelId).runs });
      if (changed) {
        await client.invalidateQueries({
          queryKey: ["telegram-ai-posting", channelId],
        });
      }
    },
  });
  const send = () => {
    const text = value.trim();
    if ((!text && !file) || reply.isPending || recording || !settingsReady)
      return;
    reply.mutate([...messages, { role: "user" as const, text }].slice(-20));
  };
  return (
    <Card className="flex h-[min(72dvh,760px)] min-h-[380px] flex-col overflow-hidden p-0">
      <header className="shrink-0 border-b border-neutral-800 px-4 py-3">
        <h2 className="text-lg font-semibold">Чат об этом канале</h2>
        <p className="mt-0.5 text-xs text-neutral-400">Идеи, редактура публикаций и настройка контента канала</p>
      </header>
      {history.isLoading && <p role="status">Загружаем историю…</p>}
      {history.isError && (
        <div role="alert" className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-lg border border-rose-900/60 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
          <span>Не удалось загрузить историю чата.</span>
          <button type="button" className="shrink-0 font-medium text-white underline underline-offset-2" onClick={() => void history.refetch()}>
            Повторить
          </button>
        </div>
      )}
      <div
        aria-label="История чата"
        className="app-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {!messages.length && !history.isLoading && !history.isError && (
          <p className="text-sm text-neutral-400">
            Расскажите, какую публикацию или рубрику хотите обсудить.
          </p>
        )}
        {messages.map((message, index) => {
          const quoted = message.replyToMessageId
            ? messages.find((item) => item.id === message.replyToMessageId)
            : null;
          return (
          <div
            key={message.id ?? index}
            className={`flex min-w-0 ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <article className={`min-w-0 max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[82%] ${message.role === "user" ? "rounded-br-md border border-blue-800/50 bg-blue-950/80 text-blue-50" : "rounded-bl-md border border-neutral-800 bg-neutral-900 text-neutral-100"}`}>
              <p className={`mb-1 text-[11px] font-medium ${message.role === "user" ? "text-blue-200" : "text-neutral-400"}`}>{message.role === "user" ? "Вы" : "AI Posting"}</p>
              {quoted ? <blockquote className="mb-2 border-l-2 border-blue-400/70 pl-2 text-xs text-neutral-300"><span className="mb-0.5 block text-neutral-500">Ответ на {quoted.role === "user" ? "ваше сообщение" : "AI Posting"}</span><span className="line-clamp-2">{quoted.text}</span></blockquote> : null}
              {message.text}
              {message.id && (
                <button type="button" className="mt-2 flex min-h-8 items-center gap-1.5 text-xs text-neutral-400 hover:text-white" onClick={() => setReplyTarget(message)} aria-label="Ответить на сообщение">
                  <MessageSquareReply size={14} aria-hidden="true" /> Ответить
                </button>
              )}
            </article>
          </div>
          );
        })}
      </div>
      <div className="max-h-40 shrink-0 overflow-y-auto px-4">
      <AiPostingChatPublication
        channelId={channelId}
        topic={
          suggestedTopic === undefined
            ? ([...messages]
                .reverse()
                .find((message) => message.role === "assistant")
                ?.suggestedTopic ?? "")
            : (suggestedTopic ?? "")
        }
        feedback={value}
        settingsReady={settingsReady}
        onGenerateActionChange={updateGenerateAction}
        onCurrentChange={setPublication}
        revisedPublication={revisedPublication}
      />
      </div>
      <div className="shrink-0 space-y-2 bg-neutral-950/70 p-3 sm:p-4">
      {replyTarget && (
        <div className="flex items-start justify-between gap-3 rounded-lg border-l-2 border-blue-500 bg-neutral-900 px-3 py-2 text-sm">
          <div className="min-w-0"><span className="text-xs text-neutral-400">Ответ на {replyTarget.role === "user" ? "ваше сообщение" : "ответ AI Posting"}</span><p className="line-clamp-2 break-words">{replyTarget.text}</p></div>
          <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white" onClick={() => setReplyTarget(null)} aria-label="Отменить ответ"><X size={16} /></button>
        </div>
      )}
      <AiPostingChatAttachments
        file={file}
        onChange={(next) => {
          setFile(next);
          setUploaded(null);
        }}
        disabled={reply.isPending}
        leadingAction={generateAction}
        onRecordingChange={setRecording}
        sendAction={
          <button
            type="button"
            aria-label={reply.isPending ? "AI Posting отвечает" : "Отправить сообщение"}
            title="Отправить сообщение"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!settingsReady || reply.isPending || recording || history.isLoading || history.isError || (!value.trim() && !file)}
            onClick={send}
          >
            <ArrowUp size={19} aria-hidden="true" />
          </button>
        }
      >
        <div className="min-w-0 flex-1">
          <Textarea
            aria-label="Сообщение"
            value={value}
            disabled={reply.isPending}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Спросите о канале или опишите правки к публикации"
            className="max-h-40 min-h-12 resize-none self-center !border-0 !bg-transparent !px-2 !py-2.5 !outline-none !ring-0 focus:!border-0 focus:!outline-none focus:!ring-0 focus:!shadow-none"
          />
        </div>
      </AiPostingChatAttachments>
      {!settingsReady && (
        <p className="text-xs text-amber-300">
          Сохраните настройки канала перед сообщением, чтобы не потерять
          несохранённые изменения.
        </p>
      )}
      {reply.isError && (
        <p role="alert" className="text-sm text-rose-300">
          {["MESSAGE_TOO_LONG", "AI_POSTING_CHAT_MESSAGE_TOO_LONG"].includes(resolveTestConsoleError(reply.error).code)
            ? "Сообщение вместе с расшифровкой слишком длинное. Сократите текст или запишите более короткое голосовое."
            : "Не удалось обработать сообщение или вложение. Текст и файл сохранены для повтора."}
        </p>
      )}
      </div>
    </Card>
  );
}
