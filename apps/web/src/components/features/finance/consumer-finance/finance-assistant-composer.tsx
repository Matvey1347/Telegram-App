import type { RefObject } from "react";
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
  onOpenPlans,
}: {
  t: ReturnType<typeof financeAssistantCopy>;
  media: FinanceAssistantMediaController;
  text: string;
  pending: boolean;
  voiceAllowed: boolean;
  fileInput: RefObject<HTMLInputElement | null>;
  onTextChange: (value: string) => void;
  onSend: () => void;
  onOpenPlans: () => void;
}) {
  return (
    <div className="space-y-2 border-t border-neutral-800 bg-neutral-950 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      {media.file ? (
        <div className="flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm">
          {media.file.type.startsWith("image/") ? (
            <FileImage size={17} />
          ) : (
            <AudioLines size={17} />
          )}
          <span className="min-w-0 flex-1 truncate">{media.file.name}</span>
          <button
            type="button"
            aria-label={t.removeAttachment}
            onClick={() => media.selectFile(null)}
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
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
        <p role="alert" className="text-xs text-rose-300">
          {t[media.error]}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <button
          type="button"
          aria-label={t.attach}
          disabled={pending || media.recording}
          onClick={() => fileInput.current?.click()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
        >
          <Paperclip size={19} />
        </button>
        <Textarea
          aria-label={t.placeholder}
          maxLength={2000}
          rows={1}
          wrap="off"
          value={text}
          placeholder={t.placeholder}
          disabled={media.recording}
          onPaste={media.onPaste}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none overflow-x-auto whitespace-nowrap"
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
            else onOpenPlans();
          }}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:opacity-50 ${media.recording ? "bg-rose-500 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
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
            pending || media.recording || (!media.file && !text.trim())
          }
          onClick={onSend}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400 text-neutral-950 hover:bg-cyan-300 disabled:opacity-40"
        >
          <Send size={18} />
        </button>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp,audio/ogg,application/ogg,audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm"
          onChange={(event) => {
            media.selectFile(event.target.files?.[0] ?? null);
            event.currentTarget.value = "";
          }}
        />
      </div>
      <p className="px-1 text-[11px] leading-4 text-neutral-500">{t.safety}</p>
    </div>
  );
}

function formatRecordingTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
