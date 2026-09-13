import { Hourglass, Timer, Trash2 } from "lucide-react";

export type LifecycleCountdownValue = {
  phase: "publication" | "deletion" | "complete";
  label: string;
};

export function LifecycleCountdown({
  value,
  className = "",
}: {
  value: LifecycleCountdownValue;
  className?: string;
}) {
  return (
    <div className={`text-xs ${className}`}>
      <p
        className={`inline-flex items-center gap-1.5 font-mono font-medium tabular-nums ${value.phase === "complete" ? "text-neutral-500" : value.phase === "deletion" ? "text-amber-300" : "text-sky-400"}`}
      >
        {value.phase === "complete" ? (
          <Trash2 size={13} aria-hidden="true" />
        ) : value.phase === "deletion" ? (
          <Timer size={13} aria-hidden="true" />
        ) : (
          <Hourglass size={13} aria-hidden="true" />
        )}
        {value.label}
      </p>
    </div>
  );
}
