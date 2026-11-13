"use client";

import { publicWebEnvironment } from "@/config/public-env";

export function DatabaseEnvironmentBadge() {
  if (!publicWebEnvironment.isDevelopment || publicWebEnvironment.databaseEnvironment !== "local") return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 top-3 z-[100] -translate-x-1/2 rounded-full border border-amber-500/50 bg-amber-950/95 px-5 py-2 text-sm font-bold tracking-wide text-amber-200 shadow-lg"
      role="status"
      aria-label="Local database connected"
      title="This local app uses the local Docker database."
    >
      LOCAL DATABASE
    </div>
  );
}
