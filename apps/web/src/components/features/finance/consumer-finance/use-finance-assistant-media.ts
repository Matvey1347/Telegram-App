"use client";

import {
  type ClipboardEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const MAX_ASSISTANT_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_ASSISTANT_FILE =
  /^(image\/(jpeg|png|webp)|audio\/(ogg|mpeg|mp4|wav|x-wav|webm)|application\/ogg)/u;

export type FinanceAssistantMediaError =
  | "unsupported"
  | "tooLarge"
  | "microphoneUnavailable";

function recordingMime() {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((mime) =>
    MediaRecorder.isTypeSupported(mime),
  );
}

function extensionForMime(mime: string) {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

export function useFinanceAssistantMedia() {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const ticker = useRef<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [error, setError] = useState<FinanceAssistantMediaError | null>(null);

  const stopStream = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (ticker.current !== null) window.clearInterval(ticker.current);
    ticker.current = null;
  }, []);

  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopStream();
    },
    [stopStream],
  );

  const selectFile = useCallback((next: File | null) => {
    setError(null);
    if (!next) {
      setFile(null);
      return false;
    }
    if (!ACCEPTED_ASSISTANT_FILE.test(next.type)) {
      setError("unsupported");
      return false;
    }
    if (next.size > MAX_ASSISTANT_FILE_BYTES) {
      setError("tooLarge");
      return false;
    }
    setFile(next);
    return true;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("microphoneUnavailable");
      return;
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      stream.current = mediaStream;
      chunks.current = [];
      const mimeType = recordingMime();
      const nextRecorder = new MediaRecorder(
        mediaStream,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = nextRecorder;
      nextRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      nextRecorder.onstop = () => {
        const type = nextRecorder.mimeType || mimeType || "audio/webm";
        const recorded = new File(
          chunks.current,
          `jarvis-voice-${Date.now()}.${extensionForMime(type)}`,
          { type },
        );
        if (recorded.size) selectFile(recorded);
        setRecording(false);
        stopStream();
      };
      nextRecorder.start(250);
      setRecordingSeconds(0);
      setRecording(true);
      ticker.current = window.setInterval(
        () => setRecordingSeconds((value) => value + 1),
        1_000,
      );
    } catch {
      stopStream();
      setError("microphoneUnavailable");
    }
  }, [selectFile, stopStream]);

  const stopRecording = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragActive(false);
      selectFile(event.dataTransfer.files[0] ?? null);
    },
    [selectFile],
  );

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      const pasted = Array.from(event.clipboardData.files).find((item) =>
        ACCEPTED_ASSISTANT_FILE.test(item.type),
      );
      if (pasted) selectFile(pasted);
    },
    [selectFile],
  );

  return {
    file,
    error,
    dragActive,
    recording,
    recordingSeconds,
    setDragActive,
    selectFile,
    startRecording,
    stopRecording,
    onDrop,
    onPaste,
  };
}

export type FinanceAssistantMediaController = ReturnType<
  typeof useFinanceAssistantMedia
>;
