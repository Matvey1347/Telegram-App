"use client";
import type { LeadQualificationView } from "@telegram-system/shared";
import { aiMoney } from "@/components/features/operations/ai/ai-format";
import { useQualificationText } from "./qualification-copy";
export function LeadPreparationScore({
  value,
}: {
  value: LeadQualificationView;
}) {
  const t = useQualificationText();
  const score = value.score;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2 text-xs text-neutral-400">
        <span>
          {value.status} · {value.policyVersion}
        </span>
        <span>
          {aiMoney(value.operation?.actualCost ?? null)} ·{" "}
          {value.operation?.pricingStatus ?? "UNKNOWN"}
        </span>
      </div>
      {score ? (
        <>
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-neutral-950/60 p-3 text-xs">
            <div>
              <dt className="text-neutral-400">{t("Relevance")}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {score.relevance ?? t("Insufficient evidence")}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-400">{t("Evidence quality")}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {score.evidenceQuality ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-400">{t("Overall priority")}</dt>
              <dd className="mt-1">
                {score.priority} · {score.overall ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-400">{t("Risk level")}</dt>
              <dd className="mt-1 break-words text-amber-200">
                {score.riskLevel}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-neutral-400">
            {t(
              "A versioned review aid, not a calibrated purchase probability or fraud verdict.",
            )}
          </p>
          <details>
            <summary className="min-h-10 cursor-pointer py-2 text-blue-300">
              {t("Explain score factors")}
            </summary>
            <ul className="space-y-2 text-xs">
              {score.factors.map((v) => (
                <li key={v.key}>
                  <b>
                    {v.key}: {v.earned}/{v.maximum}
                  </b>
                  <p className="text-neutral-400">{v.explanation}</p>
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="text-xs text-amber-200">
          {t(
            "No usable qualification result yet. Unknown usage must be reconciled before another paid attempt.",
          )}
        </p>
      )}
      {value.output ? (
        <>
          <p>{value.output.recommendedOffer}</p>
          <ul className="space-y-2">
            {value.output.reasons.map((v, i) => (
              <li key={i} className="border-l-2 border-blue-800 pl-3 text-xs">
                <p>{v.reason}</p>
                <blockquote className="mt-1 text-neutral-400">
                  “{v.quote}”
                </blockquote>
                <a
                  className="inline-flex min-h-10 items-center text-blue-300"
                  href={`#lead-evidence-${encodeURIComponent(v.observationId)}`}
                >
                  {t("View cited evidence")}
                </a>
              </li>
            ))}
          </ul>
          {value.output.riskSignals.length ? (
            <section className="space-y-2 rounded-lg border border-amber-900/60 bg-amber-950/10 p-3">
              <h4 className="font-semibold text-amber-200">
                {t("Risk signals require human verification")}
              </h4>
              {value.output.riskSignals.map((v, i) => (
                <div key={i} className="text-xs">
                  <p>
                    {v.level} · {v.code}
                  </p>
                  <p>{v.reason}</p>
                  <blockquote className="mt-1 text-neutral-400">
                    “{v.quote}”
                  </blockquote>
                </div>
              ))}
            </section>
          ) : null}
          {value.output.missingFacts.length ? (
            <div className="text-xs">
              <h4 className="font-semibold">{t("Missing information")}</h4>
              <ul className="mt-1 list-inside list-disc text-neutral-400">
                {value.output.missingFacts.map((v, i) => (
                  <li key={i}>{v}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
