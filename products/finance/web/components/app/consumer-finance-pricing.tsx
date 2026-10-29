import { useEffect, useRef } from "react";
import { ArrowRight, Check } from "lucide-react";
import offers from "../../../../../apps/standalone/finance/api/src/billing/finance-billing-offers.json";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeLandingCopy } from "@consumer-finance/web/components/i18n/landing";

type Copy = ReturnType<typeof financeLandingCopy>;

const periods = ["INTRO", "MONTH", "QUARTER", "YEAR"] as const;

function amount(minor: number, locale: FinanceLocale) {
  return `${minor / 100} ${locale === "uk" ? "грн" : "UAH"}`;
}

function PlanFeatures({ items }: { items: readonly string[] }) {
  return <ul className="landing-plan-features">
    {items.map((item) => <li key={item}><Check size={17} aria-hidden="true" />{item}</li>)}
  </ul>;
}

export function ConsumerFinancePricing({ locale, t, signInLink, onRegistrationClick }: {
  locale: FinanceLocale;
  t: Copy;
  signInLink: { href: string; target?: string; rel?: string };
  onRegistrationClick: () => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    let viewed = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || viewed) return;
      viewed = true;
      window.dispatchEvent(new CustomEvent("finance:pricing_view", { detail: { locale } }));
      observer.disconnect();
    }, { threshold: 0.2 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [locale]);

  const labels = {
    INTRO: t.landingPriceIntro,
    MONTH: t.landingPriceMonth,
    QUARTER: t.landingPriceQuarter,
    YEAR: t.landingPriceYear,
  };
  return <section ref={sectionRef} className="landing-section landing-container landing-pricing" id="pricing" aria-labelledby="landing-pricing-title">
    <div className="landing-section-intro">
      <span className="landing-kicker">05 / {t.landingPricingKicker}</span>
      <h2 id="landing-pricing-title">{t.landingPricingTitle}</h2>
      <p>{t.landingPricingLead}</p>
    </div>
    <div className="landing-plan-grid">
      <article className="landing-plan landing-plan-free">
        <h3>{t.landingFreeTitle}</h3>
        <p>{t.landingFreeBody}</p>
        <strong className="landing-free-price">0 {locale === "uk" ? "грн" : "UAH"}</strong>
        <PlanFeatures items={t.landingFreeFeatures} />
      </article>
      <article className="landing-plan landing-plan-plus">
        <div className="landing-plan-plus-heading">
          <div><h3>{t.landingPlusTitle}</h3><p>{t.landingPlusBody}</p></div>
          <PlanFeatures items={t.landingPlusFeatures} />
        </div>
        <div className="landing-price-options" aria-label={t.landingPlusTitle}>
          {periods.map((period) => <div className="landing-price-option" key={period}>
            <span>{labels[period]}</span>
            <strong>{amount(offers[period].amountMinor, locale)}</strong>
            <small>{period === "INTRO"
              ? t.landingPriceThen.replace("{price}", amount(offers.INTRO.introNextAmountMinor, locale))
              : t.landingPriceRenew}</small>
          </div>)}
        </div>
        <p className="landing-price-disclosure">{t.landingPriceOneTime}</p>
        <p className="landing-price-manage">{t.landingPriceManage}</p>
      </article>
    </div>
    <a className="landing-button landing-button-primary landing-pricing-cta" {...signInLink} onClick={onRegistrationClick}>
      {t.landingPriceCta}<ArrowRight size={18} aria-hidden="true" />
    </a>
  </section>;
}
