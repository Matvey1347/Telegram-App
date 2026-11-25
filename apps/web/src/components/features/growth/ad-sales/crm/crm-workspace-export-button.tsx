"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/primitives";

import { useEffect, useRef, useState } from "react";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { useAppToast } from "@/providers/toast-provider";
import { useCrmSalesCopy } from "./crm-sales-copy";

async function copyWorkspaceExport(textPromise: Promise<string>, signal: AbortSignal) {
  // Safari requires the clipboard operation to start inside the click event.
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const blob = textPromise.then((text) => new Blob([text], { type: "text/plain" }));
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return true;
    } catch {
      // The browser can reject the clipboard operation before the export arrives.
      await blob.catch(() => undefined);
    }
  }
  const text = await textPromise;
  signal.throwIfAborted();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // The caller can still download the complete export.
  }
  return false;
}

function downloadWorkspaceExport(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "crm-workspace-export.txt";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(URL.revokeObjectURL.bind(URL), 1_000, url);
}

export function CrmWorkspaceExportButton() {
  const { startOperation } = useAppToast();
  const t = useCrmSalesCopy();
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => () => request.current?.abort(), []);

  async function copy() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    const operation = startOperation({
      id: "crm-workspace-export",
      title: t("crmSales.export.title"),
      message: t("crmSales.export.collecting"),
    });
    try {
      const report = telegramCrmApi
        .exportWorkspace(controller.signal)
        .then((text) => {
          controller.signal.throwIfAborted();
          const end = text.slice(text.lastIndexOf("\n", text.length - 2) + 1);
          const counts = /^\{"type":"end","clients":(\d+),"conversations":\d+,"deals":\d+,"messages":\d+\}\n$/.exec(end);
          if (!counts) throw new Error("Incomplete CRM workspace export");
          return { text, count: Number(counts[1]) };
        });
      const copied = await copyWorkspaceExport(
        report.then(({ text }) => text),
        controller.signal,
      );
      const { text, count } = await report;
      controller.signal.throwIfAborted();
      if (!copied) downloadWorkspaceExport(text);
      operation.succeed({
        message: t(copied ? "crmSales.export.copied" : "crmSales.export.downloaded", { count }),
      });
    } catch {
      if (controller.signal.aborted) operation.dismiss();
      else operation.fail({ message: t("crmSales.export.failed") });
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="primary"
      disabled={pending}
      aria-busy={pending}
      onClick={() => void copy()}
      className="w-full shrink-0 sm:w-auto"
    >
      <Copy size={15} aria-hidden="true" />
      {t(pending ? "crmSales.export.pending" : "crmSales.export.copy")}
    </Button>
  );
}
