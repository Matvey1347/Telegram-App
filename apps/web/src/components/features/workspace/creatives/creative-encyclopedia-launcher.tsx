"use client";

import dynamic from "next/dynamic";
import { BookOpen } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/buttons";
import { parseCreativeLinkHash } from "@/lib/features/workspace/creative-link";
import { useI18n } from "@/providers/i18n-provider";
import { creativeLabels } from "./creative-labels";

const CreativeEncyclopedia = dynamic(() =>
  import("./creative-encyclopedia").then(
    (module) => module.CreativeEncyclopedia,
  ),
);

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

export function CreativeEncyclopediaLauncher({
  workspaceId,
  availableWorkspaces,
  onSwitchWorkspace,
}: {
  workspaceId: string;
  availableWorkspaces: readonly { id: string }[];
  onSwitchWorkspace: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );
  const linked = parseCreativeLinkHash(hash);
  const linkedWorkspace = linked?.workspaceId;
  const { locale } = useI18n();
  const labels = creativeLabels(locale);

  function clearLink(keepOpen: boolean) {
    if (linked) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
      window.dispatchEvent(new Event("hashchange"));
    }
    setOpen(keepOpen);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <BookOpen size={17} aria-hidden="true" />
        {labels.title}
      </Button>
      {open || linked ? (
        <CreativeEncyclopedia
          workspaceId={
            linked && workspaceId !== linkedWorkspace ? null : workspaceId
          }
          linkedId={linked?.id ?? null}
          labels={labels}
          onOpenWorkspace={
            linkedWorkspace &&
            availableWorkspaces.some(({ id }) => id === linkedWorkspace)
              ? () => onSwitchWorkspace(linkedWorkspace)
              : undefined
          }
          onClose={() => clearLink(false)}
          onBack={() => clearLink(true)}
        />
      ) : null}
    </>
  );
}
