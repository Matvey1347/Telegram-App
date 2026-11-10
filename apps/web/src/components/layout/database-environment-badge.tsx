"use client";

export function DatabaseEnvironmentBadge() {
  if (process.env.NEXT_PUBLIC_DATABASE_ENV !== "local") return null;

  return (
    <div
      className="fixed bottom-2 right-2 z-[100] rounded-full border border-amber-500/50 bg-amber-950/95 px-3 py-1 text-xs font-semibold text-amber-200 shadow-lg"
      role="status"
      aria-label="Local database connected"
      title="This local app uses the local Docker database."
    >
      LOCAL DATABASE
    </div>
  );
}
