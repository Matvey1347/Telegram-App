"use client";

import type {
  TelegramAiPostingChatMessage,
  TelegramAiPostingChatReply,
} from "@telegram-system/shared";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  telegramContentHypothesisKeys,
  telegramPostKeys,
} from "@/lib/query-keys";
import { Button, Card } from "@/components/ui/primitives";
import { AiPostingChatPublication } from "./ai-posting-chat-publication";
import { AiPostingDictation } from "./ai-posting-dictation";
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
  const [revisedPublication, setRevisedPublication] = useState<RevisedPublication | null>(null);
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
        })
      ).data as ChatReply;
      return {
        result,
        message: messages[messages.length - 1],
        hasAttachment: Boolean(attachment),
      };
    },
    onSuccess: async ({ result, message, hasAttachment }) => {
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
      setFile(null);
      setUploaded(null);
      const changed = result.actions?.some(
        (action) => action.status.toLowerCase() === "completed",
      );
      if (hasAttachment && !changed)
        await client.invalidateQueries({ queryKey: historyKey });
      if (result.revisedPublication && !changed)
        await client.invalidateQueries({ queryKey: aiPostingTestRunKeys(channelId).runs });
      if (changed) {
        await Promise.all([
          client.invalidateQueries({
            queryKey: ["telegram-ai-posting", channelId],
          }),
          client.invalidateQueries({
            queryKey: ["telegram-ai-posting-hypotheses", channelId],
          }),
          client.invalidateQueries({
            queryKey: ["telegram-ai-posting-post-groups", channelId],
          }),
          client.invalidateQueries({
            queryKey: telegramContentHypothesisKeys.list(channelId),
          }),
          client.invalidateQueries({
            queryKey: telegramPostKeys.postGroups(channelId),
          }),
        ]);
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
    <Card className="space-y-3 p-4">
      <h2 className="text-lg font-semibold">Чат об этом канале</h2>
      {history.isLoading && <p role="status">Загружаем историю…</p>}
      {history.isError && (
        <p role="alert">
          Не удалось загрузить историю чата.{" "}
          <button type="button" onClick={() => void history.refetch()}>
            Повторить
          </button>
        </p>
      )}
      <div
        aria-label="История чата"
        className="max-h-96 space-y-2 overflow-y-auto"
      >
        {!messages.length && (
          <p className="text-sm text-neutral-400">
            Расскажите, какую публикацию или рубрику хотите обсудить.
          </p>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`whitespace-pre-wrap rounded-lg p-3 text-sm ${message.role === "user" ? "bg-blue-950" : "bg-neutral-800"}`}
          >
            <span className="sr-only">
              {message.role === "user" ? "Вы: " : "Ассистент: "}
            </span>
            {message.text}
          </div>
        ))}
      </div>
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
        onCurrentChange={setPublication}
        revisedPublication={revisedPublication}
      />
      <AiPostingDictation
        label="Сообщение"
        value={value}
        onChange={setValue}
        disabled={reply.isPending}
        placeholder="Опишите идею или правки к публикации"
      />
      <AiPostingChatAttachments
        file={file}
        onChange={(next) => {
          setFile(next);
          setUploaded(null);
        }}
        disabled={reply.isPending}
        onRecordingChange={setRecording}
      />
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
      <Button
        type="button"
        disabled={
          !settingsReady ||
          reply.isPending ||
          recording ||
          history.isLoading ||
          history.isError ||
          (!value.trim() && !file)
        }
        onClick={send}
      >
        {reply.isPending ? "Отвечаю…" : "Отправить"}
      </Button>
    </Card>
  );
}
