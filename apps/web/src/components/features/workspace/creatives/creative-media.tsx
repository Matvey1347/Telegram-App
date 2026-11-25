"use client";

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { workspaceCreativesApi } from "@/lib/features/workspace/workspace-creatives-api";
import type { WorkspaceCreative } from "@telegram-system/shared";
import type { CreativeLabels } from "./creative-labels";

export function CreativeMedia({
  workspaceId,
  id,
  attachment,
  labels,
}: {
  workspaceId: string;
  id: string;
  attachment: NonNullable<WorkspaceCreative["attachment"]>;
  labels: CreativeLabels;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="secondary"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Paperclip aria-hidden="true" />
        {open ? labels.hideAttachment : labels.openAttachment}
      </Button>
      <span className="ml-2 break-all text-xs text-neutral-400">
        {attachment.name}
      </span>
      {open ? (
        <CreativeMediaPreview {...{ workspaceId, id, attachment, labels }} />
      ) : null}
    </div>
  );
}

function CreativeMediaPreview({
  workspaceId,
  id,
  attachment,
  labels,
}: {
  workspaceId: string;
  id: string;
  attachment: NonNullable<WorkspaceCreative["attachment"]>;
  labels: CreativeLabels;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    workspaceCreativesApi
      .attachment(workspaceId, id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [workspaceId, id]);

  if (failed)
    return (
      <p role="alert" className="text-sm text-rose-300">
        {labels.mediaError}
      </p>
    );
  if (!url)
    return (
      <p role="status" className="text-sm text-neutral-400">
        {labels.loading}
      </p>
    );
  return attachment.mimeType.startsWith("video/") ? (
    <video
      className="block max-h-96 max-w-full rounded-md"
      src={url}
      controls
      aria-label={attachment.name}
      onError={() => setFailed(true)}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated blob preview
    <img
      className="block max-h-96 max-w-full rounded-md object-contain"
      src={url}
      alt={attachment.name}
      onError={() => setFailed(true)}
    />
  );
}
