"use client";

import { useEffect, useRef, useState } from "react";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";

export const ASSISTANT_MESSAGE_MAX_LENGTH = 2000;
const FINAL_TRANSCRIPT_TIMEOUT_MS = 2000;
type SubmitTranscript = (text: string) => void;

type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechHost = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

const speechLanguage = {
  uk: "uk-UA",
  ru: "ru-RU",
  en: "en-US",
} satisfies Record<FinanceLocale, string>;

type DictationError =
  | "dictationUnavailable"
  | "dictationPermission"
  | "dictationFailed"
  | "dictationEmpty";

export function useGroshlyDictation({
  enabled,
  locale,
  onCommit,
}: {
  enabled: boolean;
  locale: FinanceLocale;
  onCommit: (text: string) => void;
}) {
  const session = useRef<{ stop: (submit?: SubmitTranscript) => void; cancel: () => void } | null>(null);
  const [phase, setPhase] = useState<"idle" | "listening" | "finishing">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<DictationError | null>(null);

  useEffect(() => {
    return () => session.current?.cancel();
  }, [enabled]);

  function start(draft: string) {
    if (!enabled || session.current) return;
    const host = window as SpeechHost;
    const SpeechRecognition = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("dictationUnavailable");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = speechLanguage[locale];
      recognition.continuous = true;
      recognition.interimResults = true;
      let transcript = "";
      let finalizeTimer: number | undefined;
      let submitTranscript: SubmitTranscript | undefined;
      const draftPrefix = draft && !/\s$/u.test(draft) ? `${draft} ` : draft;
      const draftWithTranscript = () =>
        `${draftPrefix}${transcript}`.slice(0, ASSISTANT_MESSAGE_MAX_LENGTH);

      function release() {
        session.current = null;
        window.clearTimeout(finalizeTimer);
        document.removeEventListener("visibilitychange", stopWhenHidden);
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
      }

      function finish(failure?: DictationError, allowSubmit = true) {
        const value = draftWithTranscript();
        const submit = allowSubmit && !failure && value.trim() ? submitTranscript : undefined;
        release();
        setPreview(null);
        setPhase("idle");
        setError(failure ?? (transcript || submit ? null : "dictationEmpty"));
        if (submit) submit(value);
        else if (transcript) onCommit(value);
      }

      function stopWhenHidden() {
        if (!document.hidden) return;
        finish(undefined, false);
        recognition.abort();
      }

      session.current = {
        stop(submit) {
          if (finalizeTimer !== undefined) return;
          submitTranscript = submit;
          setPhase("finishing");
          finalizeTimer = window.setTimeout(() => {
            finish();
            recognition.abort();
          }, FINAL_TRANSCRIPT_TIMEOUT_MS);
          try {
            recognition.stop();
          } catch {
            finish("dictationFailed");
            recognition.abort();
          }
        },
        cancel() {
          release();
          recognition.abort();
          setPreview(null);
          setPhase("idle");
          setError(null);
        },
      };

      recognition.onresult = ({ results }) => {
        transcript = Array.from(results, (result) => result[0]?.transcript.trim())
          .filter(Boolean)
          .join(" ");
        setPreview(transcript ? draftWithTranscript() : draft);
      };
      recognition.onerror = ({ error: code }) => {
        const failure =
          code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture"
            ? "dictationPermission"
            : code === "no-speech" ? "dictationEmpty" : "dictationFailed";
        finish(failure);
        recognition.abort();
      };
      recognition.onend = () => finish();
      document.addEventListener("visibilitychange", stopWhenHidden);
      setError(null);
      setPhase("listening");
      recognition.start();
    } catch {
      session.current?.cancel();
      setPreview(null);
      setPhase("idle");
      setError("dictationFailed");
    }
  }

  return {
    phase, preview, error, start,
    stop: (submit?: SubmitTranscript) => session.current?.stop(submit),
    cancel: () => session.current?.cancel(),
  };
}

export type GroshlyDictation = ReturnType<typeof useGroshlyDictation>;
