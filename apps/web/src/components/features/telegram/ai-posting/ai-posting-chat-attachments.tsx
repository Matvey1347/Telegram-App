"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Mic, Paperclip, Square, X } from "lucide-react";
import { recordingToPcmWav } from "./ai-posting-chat-voice";

const LIMIT = 10 * 1024 * 1024;
const buttonClass =
  "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50";

/** Keeps the file local until the containing chat explicitly sends it. */
export function AiPostingChatAttachments({
  file,
  onChange,
  disabled,
  onRecordingChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const captureId = useRef(0);
  const disabledRef = useRef(disabled);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { disabledRef.current = disabled; }, [disabled]);
  useEffect(() => {
    onRecordingChange?.(recording || starting);
  }, [onRecordingChange, recording, starting]);
  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(
    () => () => {
      captureId.current++;
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state === "recording") recorder.current.stop();
      }
      stopTracks();
    },
    [],
  );
  useEffect(() => {
    if (!file || (!audio.current && !image.current)) return;
    const url = URL.createObjectURL(file);
    if (audio.current) audio.current.src = url;
    if (image.current) image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const select = async (next?: File) => {
    if (!next || disabled || starting || recording) return;
    const request = ++captureId.current;
    setError("");
    if (
      !next.size ||
      next.size > LIMIT ||
      (next.type.startsWith("image/") && next.size > 5 * 1024 * 1024)
    ) {
      setError("Изображение должно быть не больше 5 МБ, исходное аудио — 10 МБ.");
      return;
    }
    const audioType = next.type.toLowerCase().split(";")[0];
    const audioExt = /\.(?:wav|wave|mp3|m4a|mp4|ogg|oga|opus|webm)$/i.test(next.name);
    const supportedAudio = ["audio/wav", "audio/x-wav", "audio/wave", "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a"].includes(audioType) || (!audioType && audioExt);
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(next.type) &&
      !supportedAudio
    ) {
      setError("Поддерживаются изображения JPEG, PNG, WebP и аудио WAV, WebM, OGG, MP3, M4A.");
      return;
    }
    if (!supportedAudio) { onChange(next); return; }
    setStarting(true);
    onRecordingChange?.(true);
    try {
      const wav = await recordingToPcmWav(next, { rejectLong: true });
      if (request === captureId.current && !disabledRef.current) onChange(wav);
    } catch (cause) {
      if (request === captureId.current)
        setError(cause instanceof Error && cause.message === "AUDIO_TOO_LONG" ? "Аудио должно быть не длиннее 60 секунд." : "Не удалось прочитать аудиофайл. Попробуйте другой файл или запись с микрофона.");
    } finally {
      if (request === captureId.current) { setStarting(false); onRecordingChange?.(false); }
    }
  };
  const startRecording = async () => {
    if (disabled || starting || recording) return;
    setError("");
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Запись недоступна в этом браузере. Можно прикрепить аудиофайл.",
      );
      return;
    }
    const request = ++captureId.current;
    setStarting(true);
    try {
      const captured = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      if (captureId.current !== request) {
        captured.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = captured;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((item) => MediaRecorder.isTypeSupported(item));
      const next = mime
        ? new MediaRecorder(captured, { mimeType: mime })
        : new MediaRecorder(captured);
      recorder.current = next;
      const chunks: Blob[] = [];
      let size = 0;
      next.ondataavailable = (event) => {
        size += event.data.size;
        if (size <= LIMIT) chunks.push(event.data);
        else if (next.state === "recording") next.stop();
      };
      next.onerror = () => {
        next.onstop = null;
        if (next.state === "recording") next.stop();
        stopTracks();
        setRecording(false);
        setError("Не удалось записать голосовое сообщение.");
      };
      next.onstop = async () => {
        stopTracks();
        if (captureId.current !== request) return;
        setRecording(false);
        if (size > LIMIT) {
          setError("Запись превышает 10 МБ.");
          return;
        }
        const contentType = next.mimeType || mime || "audio/webm";
        setStarting(true);
        try {
          const wav = await recordingToPcmWav(
            new Blob(chunks, { type: contentType }),
          );
          if (captureId.current === request) onChange(wav);
        } catch {
          if (captureId.current === request)
            setError(
              "Не удалось подготовить запись. Попробуйте ещё раз или прикрепите WAV.",
            );
        } finally {
          if (captureId.current === request) setStarting(false);
        }
      };
      next.start(500);
      setRecording(true);
      timer.current = setTimeout(() => {
        if (next.state === "recording") next.stop();
      }, 60_000);
    } catch {
      stopTracks();
      if (captureId.current === request)
        setError("Не удалось получить доступ к микрофону.");
    } finally {
      if (captureId.current === request) setStarting(false);
    }
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled && !recording && !starting) void select(event.dataTransfer.files[0]);
  };
  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
      className="space-y-2 rounded-lg border border-dashed border-neutral-700 p-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a,.ogg,.opus,.webm,.wav"
          className="sr-only"
          aria-label="Выбрать изображение или аудио"
          disabled={disabled || recording || starting}
          onChange={(event) => {
            void select(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || recording || starting}
          onClick={() => input.current?.click()}
          aria-label="Прикрепить изображение или аудио"
          title="Прикрепить изображение или аудио"
        >
          <Paperclip size={18} />
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || starting}
          aria-label={
            recording ? "Остановить запись" : "Записать голосовое сообщение"
          }
          title={
            recording ? "Остановить запись" : "Записать голосовое сообщение"
          }
          onClick={() =>
            recording ? recorder.current?.stop() : void startRecording()
          }
        >
          {recording ? <Square size={16} /> : <Mic size={18} />}
        </button>
        <span className="text-xs text-neutral-400">
          {starting
            ? "Подготавливаем запись или аудиофайл…"
            : recording
              ? "Запись до 60 секунд"
              : "Перетащите изображение или аудио сюда"}
        </span>
      </div>
      {file && (
        <div className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} МБ
          </span>
          <button
            type="button"
            className={buttonClass}
            aria-label="Убрать вложение"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {/* Local object URLs are assigned after mount and never sent to the image optimizer. */}
      {file?.type.startsWith("image/") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={image}
          alt="Предпросмотр вложения"
          className="max-h-40 w-auto rounded object-contain"
        />
      )}
      {file?.type.startsWith("audio/") && (
        <audio ref={audio} controls className="w-full" />
      )}
      {file && (
        <p className="text-xs text-neutral-400">
          После отправки в истории сохраняется описание или расшифровка;
          исходный файл не сохраняется.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
