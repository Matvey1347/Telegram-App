"use client";

import { publicWebEnvironment } from "@/config/public-env";

export function DatabaseEnvironmentBadge() {
  const environment = publicWebEnvironment.databaseEnvironment;
  if (!publicWebEnvironment.isDevelopment || !["local", "production"].includes(environment ?? "")) return null;
  const live = environment === "production";

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-3 z-[100] -translate-x-1/2 whitespace-nowrap rounded-full border px-5 py-2 text-sm font-bold tracking-wide shadow-lg ${live ? "border-red-400 bg-red-950 text-red-100" : "border-amber-500/50 bg-amber-950/95 text-amber-200"}`}
      role="status"
    >
      {live ? "PRODUCTION — LIVE ACTIONS" : "LOCAL DATABASE"}
    </div>
  );
}
