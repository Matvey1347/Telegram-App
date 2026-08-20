"use client";

export default function FinanceMiniAppError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-dvh bg-neutral-950 p-4 text-neutral-100">
      <p>Finance could not be opened.</p>
      <button className="mt-3 text-sky-300" onClick={reset}>Try again</button>
    </main>
  );
}
