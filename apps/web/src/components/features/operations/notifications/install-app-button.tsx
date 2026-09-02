"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/primitives";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const media =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(display-mode: standalone)")
        : null;
    const syncStandalone = () =>
      setStandalone(
        Boolean(media?.matches) ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    syncStandalone();
    media?.addEventListener("change", syncStandalone);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      media?.removeEventListener("change", syncStandalone);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  if (standalone || !promptEvent) return null;
  return (
    <div className="border-t border-neutral-800 pt-4">
      <p className="text-sm font-medium text-white">Install Nexeloq</p>
      <p className="mt-1 text-xs leading-5 text-neutral-400">
        Add this workspace app to your device for quicker access.
      </p>
      <Button
        variant="secondary"
        className="mt-3"
        onClick={() => {
          void promptEvent
            .prompt()
            .then(() => promptEvent.userChoice)
            .then(() => {
              setPromptEvent(null);
            });
        }}
      >
        <Download size={15} /> Install app
      </Button>
    </div>
  );
}
