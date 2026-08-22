"use client";

import { useSyncExternalStore } from "react";
import { SYSTEM_BRAND, systemBrandForHost } from "@/lib/app-brand";

export function SystemBrandLogo({ compact = false }: { compact?: boolean }) {
  const logo = useSyncExternalStore(
    () => () => undefined,
    () => systemBrandForHost(window.location.hostname).logo,
    () => SYSTEM_BRAND.productionLogo,
  );

  return (
    <span className="flex min-w-0 items-center gap-2">
      <img
        src={logo}
        alt=""
        className={compact ? "h-8 w-8 object-contain" : "h-10 w-10 object-contain"}
      />
      <span className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>
        {SYSTEM_BRAND.name}
      </span>
    </span>
  );
}
