import { ArrowRight, Sparkles, X } from "lucide-react";
import type { ConsumerFinanceTier } from "@telegram-system/shared";
import { Button } from "./ui";

const tierTone = {
  FREE: {
    badge: "border-[#22d3ee]/45 bg-[#22d3ee]/10 text-cyan-100",
  },
  PRO: {
    badge: "border-[#38bdf8]/50 bg-[#38bdf8]/15 text-sky-100",
    surface: "border-[#38bdf8]/45 bg-sky-950/25",
    icon: "border-[#38bdf8]/50 bg-[#38bdf8]/10 text-sky-200",
    eyebrow: "text-[#38bdf8]",
    button: "!bg-[#38bdf8] !text-slate-950 hover:!bg-sky-300",
  },
  ULTIMATE: {
    badge: "border-[#a78bfa]/50 bg-[#a78bfa]/15 text-violet-100",
    surface: "border-[#a78bfa]/45 bg-violet-950/25",
    icon: "border-[#a78bfa]/50 bg-[#a78bfa]/10 text-violet-200",
    eyebrow: "text-[#a78bfa]",
    button: "!bg-[#a78bfa] !text-slate-950 hover:!bg-violet-300",
  },
} as const;

export function FinanceTierBadge({
  tier,
  loading = false,
}: {
  tier?: ConsumerFinanceTier;
  loading?: boolean;
}) {
  if (loading)
    return (
      <span
        aria-label="Loading current plan"
        className="h-5 w-12 animate-pulse rounded-full bg-neutral-700 motion-reduce:animate-none"
      />
    );
  if (!tier) return null;
  return (
    <span
      data-finance-tier={tier}
      className={`inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[10px] font-bold tracking-[0.12em] shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] ${tierTone[tier].badge}`}
    >
      {tier}
    </span>
  );
}

export function FinancePlanPromotion({
  eyebrow,
  title,
  description,
  cta,
  tier,
  compact = false,
  onUpgrade,
  onDismiss,
  dismissLabel = "Dismiss",
}: {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  tier: Exclude<ConsumerFinanceTier, "FREE">;
  compact?: boolean;
  onUpgrade: () => void;
  onDismiss?: () => void;
  dismissLabel?: string;
}) {
  const tone = tierTone[tier];
  return (
    <section
      aria-label={title}
      className={`relative overflow-hidden rounded-2xl border ${tone.surface} ${compact ? "p-3" : "p-4"}`}
    >
      {onDismiss ? (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={onDismiss}
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-lg text-neutral-400 outline-none transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          <X size={17} aria-hidden="true" />
        </button>
      ) : null}
      <div className={`flex items-start gap-3 ${onDismiss ? "pr-8" : ""}`}>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border ${tone.icon}`}
        >
          <Sparkles size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`text-xs font-semibold uppercase tracking-[0.12em] ${tone.eyebrow}`}
            >
              {eyebrow}
            </p>
            <FinanceTierBadge tier={tier} />
          </div>
          <h3 className="mt-1 font-semibold text-neutral-100">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-neutral-300">
            {description}
          </p>
          <Button
            className={`mt-3 !inline-flex w-full items-center justify-center gap-2 sm:w-auto ${tone.button}`}
            onClick={onUpgrade}
          >
            {cta}
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
