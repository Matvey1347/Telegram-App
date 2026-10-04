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
const MAX_ASSISTANT_FILES = 5;
const MAX_ASSISTANT_TOTAL_BYTES = 16 * 1024 * 1024;
const ACCEPTED_ASSISTANT_FILE =
  /^(image\/(jpeg|png|webp)|audio\/(ogg|mpeg|mp4|wav|x-wav|webm)|application\/ogg)/u;

export type FinanceAssistantMediaError =
  | "unsupported"
  | "tooLarge"
  | "tooMany"
  | "microphoneUnavailable"
  | "voiceRequiresPro";

type FinanceAssistantAttachment = {
  file: File;
  previewUrl: string | null;
};

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
  const previewUrls = useRef(new Set<string>());
  const [attachments, setAttachments] = useState<FinanceAssistantAttachment[]>(
    [],
  );
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
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    },
    [stopStream],
  );

  const createAttachment = useCallback((file: File) => {
    const previewUrl =
      typeof URL.createObjectURL === "function"
        ? URL.createObjectURL(file)
        : null;
    if (previewUrl) previewUrls.current.add(previewUrl);
    return { file, previewUrl };
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      current.forEach(({ previewUrl }) => {
        if (!previewUrl) return;
        URL.revokeObjectURL(previewUrl);
        previewUrls.current.delete(previewUrl);
      });
      return [];
    });
    setError(null);
  }, []);

  const selectFiles = useCallback(
    (next: File[], append = true) => {
      setError(null);
      if (!next.length) return false;
      if (next.some((file) => !ACCEPTED_ASSISTANT_FILE.test(file.type))) {
        setError("unsupported");
        return false;
      }
      if (next.some((file) => file.size > MAX_ASSISTANT_FILE_BYTES)) {
        setError("tooLarge");
        return false;
      }
      const existing = append ? attachments : [];
      const combinedFiles = [...existing.map(({ file }) => file), ...next];
      const audioFiles = combinedFiles.filter(
        (file) =>
          file.type.startsWith("audio/") || file.type === "application/ogg",
      );
      if (audioFiles.length && combinedFiles.length > 1) {
        setError("unsupported");
        return false;
      }
      if (combinedFiles.length > MAX_ASSISTANT_FILES) {
        setError("tooMany");
        return false;
      }
      if (
        combinedFiles.reduce((total, file) => total + file.size, 0) >
        MAX_ASSISTANT_TOTAL_BYTES
      ) {
        setError("tooLarge");
        return false;
      }
      if (!append) clearAttachments();
      setAttachments((current) => [
        ...(append ? current : []),
        ...next.map(createAttachment),
      ]);
      return true;
    },
    [attachments, clearAttachments, createAttachment],
  );

  const removeAttachment = useCallback((index: number) => {
    setError(null);
    setAttachments((current) => {
      const removed = current[index];
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrls.current.delete(removed.previewUrl);
      }
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }, []);

  const showError = useCallback((next: FinanceAssistantMediaError) => {
    setError(next);
  }, []);

  const validateRecording = useCallback((recorded: File) => {
    if (!ACCEPTED_ASSISTANT_FILE.test(recorded.type)) {
      setError("unsupported");
      return false;
    }
    if (recorded.size > MAX_ASSISTANT_FILE_BYTES) {
      setError("tooLarge");
      return false;
    }
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
        if (recorded.size && validateRecording(recorded)) {
          clearAttachments();
          setAttachments([createAttachment(recorded)]);
        }
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
  }, [clearAttachments, createAttachment, stopStream, validateRecording]);

  const stopRecording = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragActive(false);
      selectFiles(Array.from(event.dataTransfer.files));
    },
    [selectFiles],
  );

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      const pasted = Array.from(event.clipboardData.files).filter((item) =>
        ACCEPTED_ASSISTANT_FILE.test(item.type),
      );
      if (pasted.length) selectFiles(pasted);
    },
    [selectFiles],
  );

  return {
    attachments,
    files: attachments.map(({ file }) => file),
    error,
    dragActive,
    recording,
    recordingSeconds,
    setDragActive,
    selectFiles,
    clearAttachments,
    removeAttachment,
    showError,
    startRecording,
    stopRecording,
    onDrop,
    onPaste,
  };
}

export type FinanceAssistantMediaController = ReturnType<
  typeof useFinanceAssistantMedia
>;
