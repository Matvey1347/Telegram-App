"use client";

import type { ReactNode } from "react";
import { CreativeEncyclopediaLauncher } from "@/components/features/workspace/creatives/creative-encyclopedia-launcher";
import { useAppShellWorkspace } from "@/providers/app-shell-workspace";

export function AdsHeaderActions({ children }: { children: ReactNode }) {
  const workspace = useAppShellWorkspace();

  return (
    <div className="flex flex-wrap items-center gap-2 [&>button]:w-full sm:justify-end sm:[&>button]:w-auto">
      {workspace ? (
        <CreativeEncyclopediaLauncher {...workspace} />
      ) : null}
      {children}
    </div>
  );
}
