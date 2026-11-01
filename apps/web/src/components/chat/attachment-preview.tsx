"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { File, Image as ImageIcon, Mic, Video } from "lucide-react";
import { Modal } from "@/components/ui/primitives";
import type { ChatAttachment } from "./types";

const icons = { image: ImageIcon, audio: Mic, video: Video, file: File };

/** The adapter authorizes and fetches bytes only after an explicit click. */
export function AttachmentPreview({ attachment }: { attachment: ChatAttachment }) {
  const Icon = icons[attachment.kind];
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const objectUrl = useRef<string | null>(null);
  useEffect(() => () => {
    controller.current?.abort();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, [attachment.id]);
  const release = () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; setUrl(null); };
  const open = async () => {
    if (!attachment.load || loading) return;
    controller.current?.abort();
    const next = new AbortController(); controller.current = next;
    setLoading(true); setError(false);
    try {
      const blob = await attachment.load(next.signal);
      if (next.signal.aborted) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const value = URL.createObjectURL(blob); objectUrl.current = value;
      if (attachment.kind === "file") {
        const link = document.createElement("a"); link.href = value; link.download = attachment.name; document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => { URL.revokeObjectURL(value); if (objectUrl.current === value) objectUrl.current = null; }, 1_000);
      } else setUrl(value);
    } catch { if (!next.signal.aborted) setError(true); }
    finally { if (!next.signal.aborted) setLoading(false); }
  };
  const content = <><Icon size={20} className="shrink-0" aria-hidden /><span className="min-w-0"><span className="block break-all text-sm">{attachment.name}</span>{attachment.sizeLabel ? <span className="block text-xs opacity-70">{attachment.sizeLabel}</span> : null}</span></>;
  const className = "mt-2 flex min-h-11 min-w-0 w-full items-center gap-3 rounded-lg border border-white/10 px-3 py-2 text-left text-neutral-100";
  return <>
    {attachment.load ? <button type="button" disabled={loading} onClick={() => void open()} className={`${className} hover:bg-white/5`}>{content}<span className="ml-auto text-xs">{loading ? "Loading…" : attachment.kind === "file" ? "Download" : "Open"}</span></button> : attachment.url ? <a className={`${className} hover:bg-white/5`} href={attachment.url} target="_blank" rel="noopener noreferrer">{content}</a> : <div className={className}>{content}<span className="ml-auto text-[10px] text-neutral-400">Unavailable</span></div>}
    {error ? <p role="alert" className="mt-1 text-xs text-rose-300">Media unavailable. Open again to retry.</p> : null}
    <Modal open={!!url} onClose={release} title={attachment.name} size="xl">
      {url && attachment.kind === "image" ? <Image unoptimized width={900} height={700} src={url} alt={attachment.name} className="max-h-[70dvh] w-full object-contain" /> : null}
      {url && attachment.kind === "audio" ? <audio controls preload="none" src={url} className="w-full" /> : null}
      {url && attachment.kind === "video" ? <video controls preload="none" src={url} className="max-h-[70dvh] w-full" /> : null}
    </Modal>
  </>;
}
