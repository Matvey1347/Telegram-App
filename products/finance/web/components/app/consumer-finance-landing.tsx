import {
  ArrowRight,
  BarChart3,
  Check,
  CircleHelp,
  CreditCard,
  Handshake,
  LockKeyhole,
  Sparkles,
  Moon,
  Send,
  Sun,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeLandingCopy } from "@consumer-finance/web/components/i18n/landing";
import { ConsumerFinancePricing } from "@consumer-finance/web/components/app/consumer-finance-pricing";

type Copy = ReturnType<typeof financeLandingCopy>;

function Brand({ iconUrl }: { iconUrl: string }) {
  const [failed, setFailed] = useState(false);
  const fallback = "/brand/groshly-dark-icon.png";
  return (
    <span className="landing-brand">
      <img src={failed ? fallback : iconUrl} alt="" onError={() => setFailed(true)} />
      <span>Groshly<span className="landing-brand-dot">.</span></span>
    </span>
  );
}

type PreviewScreen = "home" | "accounts" | "history" | "debts" | "analytics";

function ProductPreview({ t, locale, theme, screen }: { t: Copy; locale: FinanceLocale; theme: "light" | "dark"; screen: PreviewScreen }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "groshly-preview-preferences", locale, theme }, window.location.origin);
  }, [locale, theme]);
  return (
    <div className={`landing-real-preview landing-real-preview-${screen}`} aria-label={t.previewLabel}>
      <iframe
        ref={frame}
        title={t.previewLabel}
        src={`/preview/${screen}`}
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: "groshly-preview-preferences", locale, theme }, window.location.origin)}
        loading={screen === "home" ? "eager" : "lazy"}
      />
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return <div className="landing-faq-item">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
      {question}<CircleHelp size={18} />
    </button>
    <div className={`landing-faq-answer${open ? " is-open" : ""}`}><div><p>{answer}</p></div></div>
  </div>;
}

function Feature({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="landing-feature">
      <span className="landing-feature-number">{number}</span>
      <div className="landing-feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

export function ConsumerFinanceLanding({
  locale,
  iconUrl,
  theme,
  onThemeChange,
  onLocaleChange,
}: {
  locale: FinanceLocale;
  iconUrl: string;
  theme: "light" | "dark";
  onThemeChange: () => void;
  onLocaleChange: (locale: FinanceLocale) => void;
}) {
  const t = financeLandingCopy(locale);
  const [tourScreen, setTourScreen] = useState<PreviewScreen>("analytics");
  const [aiDemoStage, setAiDemoStage] = useState<"compose" | "proposal" | "saved">("proposal");
  const onRegistrationClick = () => {
    window.dispatchEvent(new CustomEvent("finance:registration_start", { detail: { locale, source: "landing" } }));
  };
  const signInLink = {
    href: "/login",
    onClick: onRegistrationClick,
  };
  return (
    <main className="groshly-landing" data-theme={theme} lang={locale}>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <a href="#top" aria-label="Groshly">
            <Brand key={iconUrl} iconUrl={iconUrl} />
          </a>
          <nav aria-label={t.landingNavLabel}>
            <a href="#features">{t.landingNavFeatures}</a>
            <a href="#how">{t.landingNavHow}</a>
            <a href="#pricing">{t.landingNavPricing}</a>
            <a href="#questions">{t.landingNavQuestions}</a>
          </nav>
          <div className="landing-header-actions">
            <div className="landing-language-control" role="group" aria-label="Language">
              <button type="button" aria-pressed={locale === "uk"} onClick={() => onLocaleChange("uk")}>🇺🇦 <span>Українська</span></button>
              <button type="button" aria-pressed={locale === "en"} onClick={() => onLocaleChange("en")}>🇬🇧 <span>English</span></button>
            </div>
            <button className="landing-theme-control" type="button" onClick={onThemeChange} aria-label={theme === "dark" ? "Light theme" : "Dark theme"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <a className="landing-header-cta" {...signInLink}>
              {t.landingCta}<ArrowRight size={16} />
            </a>
          </div>
        </div>
      </header>
      <section className="landing-hero landing-container" id="top">
        <div className="landing-hero-copy">
          <span className="landing-eyebrow">
            <span className="landing-eyebrow-line" />
            {t.landingEyebrow}
          </span>
          <h1>{t.landingTitle}</h1>
          <p>{t.landingDescription}</p>
          <div className="landing-hero-actions">
            <a
              className="landing-button landing-button-primary"
              {...signInLink}
            >
              {t.landingCta}
              <ArrowRight size={20} />
            </a>
            <a className="landing-button landing-button-text" href="#features">
              {t.landingExplore}
              <ArrowRight size={18} />
            </a>
          </div>
          <div className="landing-hero-foot">
            <span>
              <Check size={15} />
              {t.landingNoInstall}
            </span>
            <span>
              <Check size={15} />
              {t.landingOneAccount}
            </span>
          </div>
        </div>
        <div className="landing-hero-visual">
          <span className="landing-visual-orbit landing-visual-orbit-one" />
          <span className="landing-visual-orbit landing-visual-orbit-two" />
          <ProductPreview t={t} locale={locale} theme={theme} screen="home" />
        </div>
      </section>
      <div className="landing-signal">
        <div className="landing-container landing-signal-inner">
          <p>{t.landingSignal}</p>
          <div>
            <span>
              <Wallet size={19} />
              {t.landingAccounts}
            </span>
            <span>
              <CreditCard size={19} />
              {t.landingTransactions}
            </span>
            <span>
              <Handshake size={19} />
              {t.landingDebts}
            </span>
            <span>
              <BarChart3 size={19} />
              {t.landingAnalytics}
            </span>
          </div>
        </div>
      </div>
      <section className="landing-section landing-container" id="features">
        <div className="landing-section-intro">
          <span className="landing-kicker">01 / {t.landingNavFeatures}</span>
          <h2>{t.landingFeaturesTitle}</h2>
          <p>{t.landingFeaturesLead}</p>
        </div>
        <div className="landing-feature-grid">
          <Feature
            number="01"
            icon={<Wallet size={26} />}
            title={t.landingFeatureAccountsTitle}
            description={t.landingFeatureAccountsBody}
          />
          <Feature
            number="02"
            icon={<CreditCard size={26} />}
            title={t.landingFeatureTransactionsTitle}
            description={t.landingFeatureTransactionsBody}
          />
          <Feature
            number="03"
            icon={<Handshake size={26} />}
            title={t.landingFeatureDebtsTitle}
            description={t.landingFeatureDebtsBody}
          />
          <Feature
            number="04"
            icon={<BarChart3 size={26} />}
            title={t.landingFeatureAnalyticsTitle}
            description={t.landingFeatureAnalyticsBody}
          />
        </div>
      </section>
      <section className="landing-showcase">
        <div className="landing-container landing-showcase-inner">
          <div>
            <span className="landing-kicker">
              02 / {t.landingShowcaseKicker}
            </span>
            <h2>{t.landingShowcaseTitle}</h2>
            <p>{t.landingShowcaseBody}</p>
            <a className="landing-button landing-button-light" {...signInLink}>
              {t.landingCta}
              <ArrowRight size={18} />
            </a>
          </div>
          <div className="landing-showcase-visual">
            <div className="landing-preview-tabs" role="group" aria-label={locale === "uk" ? "Екрани застосунку" : "App screens"}>
              {([ ["accounts", t.landingAccounts], ["history", t.landingTransactions], ["debts", t.landingDebts], ["analytics", t.landingAnalytics] ] as const).map(([screen, label]) => (
                <button key={screen} type="button" aria-pressed={tourScreen === screen} onClick={() => setTourScreen(screen)}>{label}</button>
              ))}
            </div>
            <ProductPreview t={t} locale={locale} theme={theme} screen={tourScreen} />
          </div>
        </div>
      </section>
      <section className="landing-section landing-container landing-ai" aria-labelledby="landing-ai-title">
        <div className="landing-ai-copy">
          <span className="landing-kicker">03 / {t.landingAiKicker}</span>
          <h2 id="landing-ai-title">{t.landingAiTitle}</h2>
          <p>{t.landingAiBody}</p>
          <small>{t.landingAiAvailability}</small>
        </div>
        <div className="landing-ai-demo" aria-label={t.landingAiKicker}>
          <div className="landing-ai-chat-head"><span className="landing-ai-avatar"><Sparkles size={18} /></span><div><strong>Jarvis</strong><small>{locale === "uk" ? "Помічник Groshly" : "Groshly assistant"}</small></div><span className="landing-ai-demo-label">{t.previewTag}</span></div>
          <div className="landing-ai-conversation" aria-live="polite">
            {aiDemoStage !== "compose" && <p className="landing-ai-message"><span>{t.landingAiExample}</span></p>}
            {aiDemoStage === "proposal" && <div className="landing-ai-result"><span className="landing-ai-result-label"><Sparkles size={16} />{locale === "uk" ? "Готово до перевірки" : "Ready to review"}</span><strong>{locale === "uk" ? "Продукти" : "Groceries"}</strong><span>{locale === "uk" ? "Витрата · 120 грн" : "Expense · 120 UAH"}</span><button type="button" onClick={() => setAiDemoStage("saved")}>{locale === "uk" ? "Підтвердити витрату" : "Confirm expense"}<ArrowRight size={16} /></button></div>}
            {aiDemoStage === "saved" && <p className="landing-ai-response"><Check size={18} aria-hidden="true" /><span>{locale === "uk" ? "Витрату 120 грн на продукти записано." : "The 120 UAH grocery expense was recorded."}</span></p>}
          </div>
          <div className="landing-ai-compose"><span>{t.landingAiExample}</span><button type="button" aria-label={locale === "uk" ? "Показати приклад" : "Play example"} onClick={() => setAiDemoStage(aiDemoStage === "compose" ? "proposal" : "compose")}><Send size={18} /></button></div>
          <p className="landing-ai-demo-note">{t.landingAiDemoNote}</p>
        </div>
      </section>
      <section className="landing-section landing-container" id="how">
        <div className="landing-section-intro">
          <span className="landing-kicker">04 / {t.landingNavHow}</span>
          <h2>{t.landingHowTitle}</h2>
          <p>{t.landingHowLead}</p>
        </div>
        <div className="landing-steps">
          <div>
            <span>01</span>
            <Send size={24} />
            <h3>{t.landingStepOneTitle}</h3>
            <p>{t.landingStepOneBody}</p>
          </div>
          <div>
            <span>02</span>
            <CreditCard size={24} />
            <h3>{t.landingStepTwoTitle}</h3>
            <p>{t.landingStepTwoBody}</p>
          </div>
          <div>
            <span>03</span>
            <BarChart3 size={24} />
            <h3>{t.landingStepThreeTitle}</h3>
            <p>{t.landingStepThreeBody}</p>
          </div>
        </div>
      </section>
      <section className="landing-security landing-container">
        <div className="landing-security-icon">
          <LockKeyhole size={27} />
        </div>
        <div>
          <span className="landing-kicker">{t.landingSecurityKicker}</span>
          <h2>{t.landingSecurityTitle}</h2>
          <p>{t.landingSecurity}</p>
        </div>
      </section>
      <ConsumerFinancePricing locale={locale} t={t} signInLink={signInLink} onRegistrationClick={onRegistrationClick} />
      <section
        className="landing-section landing-container landing-faq"
        id="questions"
      >
        <div className="landing-section-intro">
          <span className="landing-kicker">06 / FAQ</span>
          <h2>{t.landingFaqTitle}</h2>
        </div>
        <div className="landing-faq-list">
          <FaqItem question={t.landingFaqOneQ} answer={t.landingFaqOneA} />
          <FaqItem question={t.landingFaqTwoQ} answer={t.landingFaqTwoA} />
          <FaqItem question={t.landingFaqThreeQ} answer={t.landingFaqThreeA} />
        </div>
      </section>
      <footer className="landing-footer landing-container">
        <Brand key={iconUrl} iconUrl={iconUrl} />
        <p>
          © {new Date().getFullYear()} Groshly. {t.landingFooter}
        </p>
        <div className="landing-footer-links">
          <a href="/privacy">{t.landingPrivacy}</a>
          <a href="/terms">{t.landingTerms}</a>
          <a href="#top">{t.landingBackTop} ↑</a>
        </div>
      </footer>
    </main>
  );
}
