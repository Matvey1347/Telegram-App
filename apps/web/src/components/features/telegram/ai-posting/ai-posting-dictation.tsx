"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { Textarea } from "@/components/ui/primitives";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

function RecordingWaveform() {
  const bars = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let frame = 0;
    let disposed = false;
    async function listen() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext)
          return;
        const captured = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (disposed) {
          captured.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = captured;
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          analyser.getByteFrequencyData(samples);
          Array.from(bars.current?.children ?? []).forEach((bar, index) => {
            const level = samples[2 + index * 3] ?? 0;
            (bar as HTMLElement).style.height =
              `${Math.max(4, Math.round((level / 255) * 24))}px`;
          });
          frame = requestAnimationFrame(draw);
        };
        draw();
      } catch {
        // Speech recognition remains usable if audio visualization is unavailable.
      }
    }
    void listen();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (context) void context.close();
    };
  }, []);
  return (
    <div
      ref={bars}
      aria-hidden="true"
      className="flex h-7 items-center gap-0.5"
    >
      {Array.from({ length: 7 }, (_, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-blue-400"
          style={{ height: 4 }}
        />
      ))}
    </div>
  );
}

export function AiPostingDictation({
  value,
  onChange,
  disabled,
  label,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
  label: string;
  ariaLabel?: string;
  placeholder: string;
}) {
  const fieldId = useId();
  const recognition = useRef<Recognition | null>(null);
  const callback = useRef(onChange);
  const base = useRef("");
  const valueRef = useRef(value);
  useEffect(() => {
    callback.current = onChange;
    valueRef.current = value;
  }, [onChange, value]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (recognition.current) {
        recognition.current.onend = null;
        recognition.current.onerror = null;
        recognition.current.onresult = null;
        recognition.current.abort();
      }
      recognition.current = null;
    },
    [],
  );
  useEffect(() => {
    if (disabled && recognition.current) recognition.current.stop();
  }, [disabled]);

  const toggle = () => {
    if (recognition.current) {
      recognition.current.stop();
      return;
    }
    const host = window as SpeechWindow;
    const SpeechRecognition =
      host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(
        "Диктовка недоступна в этом браузере. Используйте голосовой ввод клавиатуры или введите текст.",
      );
      return;
    }
    setError("");
    const instance = new SpeechRecognition();
    recognition.current = instance;
    base.current = valueRef.current;
    instance.lang = "ru-RU";
    instance.continuous = true;
    instance.interimResults = true;
    instance.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript.trim())
        .filter(Boolean)
        .join(" ");
      callback.current(
        [base.current.trimEnd(), transcript].filter(Boolean).join(" "),
      );
    };
    instance.onerror = () =>
      setError(
        "Не удалось распознать речь. Проверьте доступ к микрофону и попробуйте снова.",
      );
    instance.onend = () => {
      if (recognition.current === instance) recognition.current = null;
      setRecording(false);
    };
    try {
      instance.start();
      setRecording(true);
    } catch {
      recognition.current = null;
      setRecording(false);
      setError("Не удалось включить микрофон.");
    }
  };
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium" htmlFor={fieldId}>
        {label}
      </label>
      <div className="flex items-start gap-2">
        <Textarea
          id={fieldId}
          aria-label={ariaLabel ?? label}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            if (recognition.current) {
              recognition.current.onresult = null;
              recognition.current.stop();
            }
            onChange(event.target.value);
          }}
          rows={2}
          placeholder={placeholder}
        />
        <div className="flex min-h-10 shrink-0 items-center gap-2">
          {recording && <RecordingWaveform />}
          <button
            type="button"
            disabled={disabled}
            onClick={toggle}
            aria-label={
              recording ? "Остановить диктовку" : "Надиктовать правки"
            }
            aria-pressed={recording}
            title={recording ? "Остановить диктовку" : "Надиктовать правки"}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
          >
            {recording ? <Square size={16} /> : <Mic size={18} />}
          </button>
        </div>
      </div>
      {recording && (
        <span className="sr-only" role="status">
          Идёт диктовка
        </span>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
