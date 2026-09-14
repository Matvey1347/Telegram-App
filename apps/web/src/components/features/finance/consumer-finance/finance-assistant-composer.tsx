import Image from "next/image";
import { useEffect, useRef, type RefObject } from "react";
import {
  AudioLines,
  FileImage,
  Mic,
  Paperclip,
  Send,
  Square,
  X,
} from "lucide-react";
import { Textarea } from "./ui";
import { financeAssistantCopy } from "./i18n/assistant";
import type { FinanceAssistantMediaController } from "./use-finance-assistant-media";

export function FinanceAssistantComposer({
  t,
  media,
  text,
  pending,
  voiceAllowed,
  fileInput,
  onTextChange,
  onSend,
  onUpgrade,
}: {
  t: ReturnType<typeof financeAssistantCopy>;
  media: FinanceAssistantMediaController;
  text: string;
  pending: boolean;
  voiceAllowed: boolean;
  fileInput: RefObject<HTMLInputElement | null>;
  onTextChange: (value: string) => void;
  onSend: () => void;
  onUpgrade: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    resizeComposer(textareaRef.current);
  }, [text]);

  return (
    <div className="space-y-2 border-t border-neutral-800 bg-neutral-950 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      {media.attachments.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {media.attachments.map(({ file, previewUrl }, index) => (
            <div
              key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
              className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900"
            >
              {file.type.startsWith("image/") && previewUrl ? (
                <Image
                  unoptimized
                  fill
                  src={previewUrl}
                  alt={file.name}
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-neutral-300">
                  {file.type.startsWith("image/") ? (
                    <FileImage aria-hidden size={22} />
                  ) : (
                    <AudioLines aria-hidden size={22} />
                  )}
                  <span className="line-clamp-2 text-[11px] leading-4">
                    {file.name}
                  </span>
                </div>
              )}
              <button
                type="button"
                aria-label={`${t.removeAttachment}: ${file.name}`}
                onClick={() => media.removeAttachment(index)}
                className="absolute right-1 top-1 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/75 text-white hover:bg-black"
              >
                <X aria-hidden size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {media.recording ? (
        <div
          role="status"
          className="flex items-center gap-2 px-1 text-sm text-rose-300"
        >
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-rose-400 motion-reduce:animate-none" />
          {t.recording} {formatRecordingTime(media.recordingSeconds)}
        </div>
      ) : null}
      {media.error ? (
        media.error === "voiceRequiresPro" ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-800/70 bg-sky-950/25 px-3 py-2"
          >
            <p className="text-xs text-sky-100">{t.voiceRequiresPro}</p>
            <button
              type="button"
              onClick={onUpgrade}
              className="min-h-9 rounded-lg bg-[#38bdf8] px-3 text-xs font-semibold text-slate-950 outline-none transition hover:bg-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              {t.voiceUpgradeCta}
            </button>
          </div>
        ) : (
          <p role="alert" className="text-xs text-rose-300">
            {t[media.error]}
          </p>
        )
      ) : null}
      <div className="flex items-end gap-1 rounded-[28px] border border-white/10 bg-neutral-900 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <button
          type="button"
          aria-label={t.attach}
          disabled={pending || media.recording}
          onClick={() => fileInput.current?.click()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-300 outline-none hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <Paperclip size={19} />
        </button>
        <Textarea
          ref={textareaRef}
          aria-label={t.placeholder}
          maxLength={2000}
          rows={1}
          value={text}
          placeholder={t.placeholder}
          disabled={media.recording}
          onPaste={media.onPaste}
          onChange={(event) => {
            resizeComposer(event.currentTarget);
            onTextChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          className="max-h-[104px] min-h-11 min-w-0 flex-1 resize-none overflow-y-hidden whitespace-pre-wrap break-words !rounded-none !border-0 !bg-transparent px-2 py-3 leading-5 !outline-none !ring-0 focus:!ring-0 focus-visible:!ring-0"
        />
        <button
          type="button"
          aria-label={
            media.recording
              ? t.stopRecording
              : voiceAllowed
                ? t.record
                : t.voiceRequiresPro
          }
          disabled={pending}
          onClick={() => {
            if (media.recording) media.stopRecording();
            else if (voiceAllowed) void media.startRecording();
            else media.showError("voiceRequiresPro");
          }}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${media.recording ? "bg-rose-500 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
        >
          {media.recording ? (
            <Square size={16} fill="currentColor" />
          ) : (
            <Mic size={19} />
          )}
        </button>
        <button
          type="button"
          aria-label={t.send}
          disabled={
            pending || media.recording || (!media.files.length && !text.trim())
          }
          onClick={onSend}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-cyan-400 text-neutral-950 outline-none hover:bg-cyan-300 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 disabled:opacity-40"
        >
          <Send size={18} />
        </button>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,audio/ogg,application/ogg,audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm"
          onChange={(event) => {
            media.selectFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />
      </div>
      <p className="px-1 text-center text-[11px] leading-4 text-neutral-500">
        {t.safety}
      </p>
    </div>
  );
}

const COMPOSER_MAX_HEIGHT = 104;

function resizeComposer(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const height = Math.min(textarea.scrollHeight, COMPOSER_MAX_HEIGHT);
  textarea.style.height = height ? `${height}px` : "";
  textarea.style.overflowY =
    textarea.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
}

function formatRecordingTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
