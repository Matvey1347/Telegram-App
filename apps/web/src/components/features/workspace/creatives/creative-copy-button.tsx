"use client";

import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, Textarea } from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { loadCreativeEncyclopediaText } from "./creative-copy";
import type { CreativeLabels } from "./creative-labels";

export function CreativeCopyButton({
  workspaceId,
  labels,
}: {
  workspaceId: string;
  labels: CreativeLabels;
}) {
  const request = useRef<AbortController | null>(null);
  const { pushToast } = useAppToast();
  const [copying, setCopying] = useState(false);
  const [manualText, setManualText] = useState("");
  const [error, setError] = useState(false);
  useEffect(() => () => request.current?.abort(), []);

  async function copy() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setCopying(true);
    setManualText("");
    setError(false);
    const content = loadCreativeEncyclopediaText(
      workspaceId,
      labels,
      window.location.origin,
      controller.signal,
    );
    // Start the clipboard operation in the click handler so browsers that require
    // transient user activation can wait for the paginated request.
    const clipboard = navigator.clipboard;
    const write = (async () => {
      if (
        !clipboard ||
        typeof ClipboardItem === "undefined" ||
        !clipboard.write
      )
        return false;
      try {
        await clipboard.write([
          new ClipboardItem({
            "text/plain": content.then(
              (value) => new Blob([value], { type: "text/plain" }),
            ),
          }),
        ]);
        return true;
      } catch {
        return false;
      }
    })();
    try {
      const text = await content;
      if (controller.signal.aborted) return;
      if (await write) {
        if (!controller.signal.aborted) pushToast(labels.copied, "success");
        return;
      }
      if (controller.signal.aborted) return;
      try {
        await clipboard.writeText(text);
        if (!controller.signal.aborted) pushToast(labels.copied, "success");
      } catch {
        if (!controller.signal.aborted) setManualText(text);
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setCopying(false);
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <Button
        type="button"
        className="max-w-full !whitespace-normal text-left"
        onClick={() => void copy()}
        disabled={copying}
      >
        <Copy aria-hidden="true" />
        {copying ? labels.copying : labels.copy}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {labels.copyError}
        </p>
      ) : null}
      {manualText ? (
        <label
          className="block space-y-1 text-sm text-neutral-300"
          ref={(element) => {
            const textarea = element?.querySelector("textarea");
            textarea?.focus();
            textarea?.select();
          }}
        >
          <span>{labels.copyFallback}</span>
          <Textarea readOnly value={manualText} rows={5} />
        </label>
      ) : null}
    </div>
  );
}
