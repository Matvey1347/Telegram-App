import {
  ArrowRight,
  BarChart3,
  Check,
  CircleHelp,
  CreditCard,
  Handshake,
  LockKeyhole,
  Moon,
  Send,
  Sun,
  Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { FinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { financeLandingCopy } from "@consumer-finance/web/components/i18n/landing";

type Copy = ReturnType<typeof financeLandingCopy>;

function Brand({ iconUrl }: { iconUrl: string }) {
  const [failed, setFailed] = useState(false);
  const fallback = process.env.NODE_ENV === "development" ? "/brand/groshly-dev-icon.png" : "/brand/groshly-icon.png";
  return (
    <span className="landing-brand">
      <img src={failed ? fallback : iconUrl} alt="" onError={() => setFailed(true)} />
      <span>Groshly<span className="landing-brand-dot">.</span></span>
    </span>
  );
}

function ProductPreview({ t, botId, locale, theme, screen }: { t: Copy; botId: string; locale: FinanceLocale; theme: "light" | "dark"; screen: "home" | "analytics" }) {
  return (
    <div className={`landing-real-preview landing-real-preview-${screen}`} aria-label={t.previewLabel}>
      <iframe
        title={t.previewLabel}
        aria-hidden="true"
        src={`/preview/${screen}?lang=${locale}&theme=${theme}&botId=${encodeURIComponent(botId)}`}
        tabIndex={-1}
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
  botId,
  iconUrl,
  login,
  loginUrl,
  onLoginClick,
  theme,
  onThemeChange,
  onLocaleChange,
}: {
  locale: FinanceLocale;
  botId: string;
  iconUrl: string;
  login: ReactNode;
  loginUrl?: string;
  onLoginClick: () => void;
  theme: "light" | "dark";
  onThemeChange: () => void;
  onLocaleChange: (locale: FinanceLocale) => void;
}) {
  const t = financeLandingCopy(locale);
  const signInLink = {
    href: loginUrl ?? "#start",
    ...(loginUrl
      ? { target: "_blank", rel: "noreferrer", onClick: onLoginClick }
      : {}),
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
          <ProductPreview t={t} botId={botId} locale={locale} theme={theme} screen="home" />
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
            <ProductPreview t={t} botId={botId} locale={locale} theme={theme} screen="analytics" />
          </div>
        </div>
      </section>
      <section className="landing-section landing-container" id="how">
        <div className="landing-section-intro">
          <span className="landing-kicker">03 / {t.landingNavHow}</span>
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
      <section
        className="landing-section landing-container landing-faq"
        id="questions"
      >
        <div className="landing-section-intro">
          <span className="landing-kicker">04 / FAQ</span>
          <h2>{t.landingFaqTitle}</h2>
        </div>
        <div className="landing-faq-list">
          <FaqItem question={t.landingFaqOneQ} answer={t.landingFaqOneA} />
          <FaqItem question={t.landingFaqTwoQ} answer={t.landingFaqTwoA} />
          <FaqItem question={t.landingFaqThreeQ} answer={t.landingFaqThreeA} />
        </div>
      </section>
      <section className="landing-start" id="start">
        <div className="landing-container landing-start-inner">
          <div>
            <span className="landing-kicker">{t.landingStartKicker}</span>
            <h2>{t.landingStartTitle}</h2>
            <p>{t.landingStartBody}</p>
            <div className="landing-start-checks">
              <span>
                <Check size={17} />
                {t.landingNoInstall}
              </span>
              <span>
                <Check size={17} />
                {t.landingOneAccount}
              </span>
            </div>
          </div>
          {login}
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
