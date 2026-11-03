"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Mic, Paperclip, Square } from "lucide-react";
import { Button, Input, Modal } from "@/components/ui/primitives";
import type { CrmChatCapabilities } from "@telegram-system/shared";

export function CrmChatMediaControls({ capabilities, disabled, onUpload, showVoice = true }: {
  capabilities?: CrmChatCapabilities;
  disabled: boolean;
  showVoice?: boolean;
  onUpload: (data: FormData, signal: AbortSignal) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const captureRequest = useRef(0);
  const capturePending = useRef(false);
  const tracks = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const previewUrl = useRef<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordDialog, setRecordDialog] = useState(false);
  const [fileFallback, setFileFallback] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [voice, setVoice] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const stopTracks = () => { tracks.current?.getTracks().forEach((track) => track.stop()); tracks.current = null; if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (recorder.current?.state === "recording") recorder.current.stop(); tracks.current?.getTracks().forEach((track) => track.stop()); if (timer.current) clearTimeout(timer.current); abort.current?.abort(); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }; }, []);
  const choose = (next: File | null, asVoice = false) => {
    setError("");
    if (!next) return;
    if (!next.size || next.size > (capabilities?.maxUploadBytes ?? 10 * 1024 * 1024)) { setError("Choose a non-empty file within the upload size limit."); return; }
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = next.type.startsWith("image/") || next.type.startsWith("audio/") ? URL.createObjectURL(next) : null;
    setPreview(previewUrl.current); setVoice(asVoice); setFile(next); setCaption("");
  };
  const discardFile = () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); previewUrl.current = null; setPreview(null); setFile(null); };
  const nativeVoice = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") && capabilities?.canSendVoice;
  const start = async () => {
    if (disabled || recording || capturePending.current || (!nativeVoice && !fileFallback)) return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Recording is unavailable in this browser. Attach an audio file instead."); return; }
    const request = ++captureRequest.current; capturePending.current = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || request !== captureRequest.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      tracks.current = stream;
      const mime = nativeVoice ? "audio/ogg;codecs=opus" : ["audio/webm;codecs=opus", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) { stopTracks(); setError("No supported recording format. Attach an audio file instead."); return; }
      const capture = new MediaRecorder(stream, { mimeType: mime }); recorder.current = capture;
      const chunks: Blob[] = []; let bytes = 0;
      capture.ondataavailable = (event) => { bytes += event.data.size; if (bytes > (capabilities?.maxUploadBytes ?? 10 * 1024 * 1024)) { if (capture.state === "recording") capture.stop(); setError("Recording exceeded the upload limit."); } else chunks.push(event.data); };
      capture.onstop = () => {
        stopTracks(); if (!mounted.current) return;
        setRecording(false); setRecordDialog(false);
        if (bytes && bytes <= (capabilities?.maxUploadBytes ?? 10 * 1024 * 1024)) choose(new File(chunks, nativeVoice ? "voice.ogg" : mime.includes("mp4") ? "recording.m4a" : "recording.webm", { type: mime }), !!nativeVoice);
      };
      capture.onerror = () => { stopTracks(); setRecording(false); setError("Recording failed. No audio was sent."); };
      capture.start(500); setRecording(true);
      timer.current = setTimeout(() => { if (capture.state === "recording") capture.stop(); }, 60_000);
    } catch { stopTracks(); if (mounted.current && request === captureRequest.current) setError("Microphone permission was denied or unavailable. No audio was sent."); }
    finally { capturePending.current = false; }
  };
  const cancelRecording = () => { captureRequest.current++; if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state === "recording") recorder.current.stop(); } stopTracks(); setRecording(false); setRecordDialog(false); };
  const upload = async () => {
    if (!file || disabled || uploading) return;
    const controller = new AbortController(); abort.current = controller; setUploading(true);
    const body = new FormData(); body.set("file", file); body.set("kind", voice ? "VOICE" : file.type.startsWith("image/") ? "IMAGE" : "FILE"); if (caption.trim()) body.set("caption", caption.trim());
    try { if (await onUpload(body, controller.signal)) { discardFile(); setCaption(""); } }
    finally { if (mounted.current) setUploading(false); }
  };
  if (!capabilities?.canUpload) return null;
  return <>
    <input ref={input} type="file" className="sr-only" aria-label="Choose attachment" onChange={(event) => { choose(event.target.files?.[0] ?? null); event.target.value = ""; }} />
    <button type="button" className="order-none inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-300 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-40" disabled={disabled} onClick={() => input.current?.click()} aria-label="Attach file" title="Attach file"><Paperclip size={19} /></button>
    {showVoice ? <button type="button" className="order-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-200 hover:bg-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-40" disabled={disabled} onClick={() => setRecordDialog(true)} aria-label="Record audio" title="Record audio"><Mic size={19} /></button> : null}
    {error ? <p role="alert" className="basis-full text-xs text-rose-300">{error}</p> : null}
    <Modal open={recordDialog} onClose={cancelRecording} title="Record audio" size="sm">
      <p className="mb-3 text-sm text-neutral-300">Record up to 60 seconds, then listen before sending.</p>
      {!nativeVoice ? <label className="mb-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={fileFallback} onChange={(event) => setFileFallback(event.target.checked)} disabled={recording} />This browser cannot record Telegram voice. Record and send an audio file instead.</label> : null}
      <div className="flex flex-wrap gap-2"><Button disabled={recording || (!nativeVoice && !fileFallback)} onClick={() => void start()}>Start recording</Button><Button variant="secondary" disabled={!recording} onClick={() => recorder.current?.stop()}><Square size={16} />Stop</Button><Button variant="secondary" onClick={cancelRecording}>Cancel recording</Button></div>
    </Modal>
    <Modal open={!!file} onClose={() => { if (!uploading) discardFile(); }} title={voice ? "Voice preview" : "Attachment preview"} size="sm">
      <p className="mb-2 break-all text-sm">{file?.name} · {file?.type || "Unknown type"} · {((file?.size ?? 0) / 1024).toFixed(1)} KB</p>
      {preview && file?.type.startsWith("image/") ? <Image unoptimized width={600} height={400} src={preview} alt="Attachment preview" className="mb-3 max-h-60 w-full object-contain" /> : null}
      {preview && file?.type.startsWith("audio/") ? <audio controls preload="none" src={preview} className="mb-3 w-full" /> : null}
      <label className="mb-3 block text-sm">Caption (manual text)<Input value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1024} disabled={uploading} /></label>
      <div className="flex flex-wrap gap-2"><Button disabled={disabled || uploading} onClick={() => void upload()}>{uploading ? "Uploading…" : voice ? "Send voice" : "Send attachment"}</Button><Button variant="secondary" onClick={() => uploading ? abort.current?.abort() : discardFile()}>{uploading ? "Cancel upload" : "Cancel"}</Button></div>
      {uploading ? <p role="status" className="mt-2 text-xs text-neutral-400">Uploading; server confirmation is required. Cancelling may leave the result unknown.</p> : null}
    </Modal>
  </>;
}
