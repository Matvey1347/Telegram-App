import { Check } from "lucide-react";
import type { ConsumerFinanceTier } from "@telegram-system/shared";
import { Button } from "./ui";
import { financePlansCopy } from "./i18n/plans";
import type { FinanceLocale } from "./i18n/core";
import {
  consumerFinanceFeatureLabel,
  consumerFinanceOffersForPlan,
  consumerFinanceTierLabel,
  formatConsumerFinancePlanPrice,
  type ConsumerFinanceCatalogPlan,
  type ConsumerFinanceCatalogProvider,
  type ConsumerFinanceCheckoutOffer,
} from "./finance-consumer-billing-format";
import { FinancePlanVisual } from "./finance-plan-visual";
import styles from "./finance-plans.module.css";

type PlansCopy = ReturnType<typeof financePlansCopy>;

export function FinancePlanCard({
  plan,
  providers,
  currentTier,
  locale,
  copy,
  mobileActive,
  paymentPlan,
  checkoutPending,
  onChoose,
  onCheckout,
}: {
  plan: ConsumerFinanceCatalogPlan;
  providers: ConsumerFinanceCatalogProvider[];
  currentTier: ConsumerFinanceTier;
  locale: FinanceLocale;
  copy: PlansCopy;
  mobileActive: boolean;
  paymentPlan: string | null;
  checkoutPending: boolean;
  onChoose: (
    plan: ConsumerFinanceCatalogPlan,
    offers: ConsumerFinanceCheckoutOffer[],
  ) => void;
  onCheckout: (offer: ConsumerFinanceCheckoutOffer) => void;
}) {
  const selected = plan.code === currentTier;
  const featured = plan.code === "PRO";
  const offers = consumerFinanceOffersForPlan(plan, providers);
  const positioning =
    plan.code === "PRO"
      ? copy.proPositioning
      : plan.code === "ULTIMATE"
        ? copy.ultimatePositioning
        : copy.freePositioning;

  return (
    <section
      id={`finance-plan-panel-${plan.code}`}
      role="tabpanel"
      aria-labelledby={`finance-plan-tab-${plan.code}`}
      data-finance-plan={plan.code}
      data-featured={featured || undefined}
      data-mobile-active={mobileActive ? "true" : "false"}
      className={`${styles.planCard} ${styles[`plan${plan.code}`]} ${mobileActive ? styles.mobileActive : ""}`}
    >
      <header className={styles.planHeader}>
        <div className="min-w-0">
          <p className={styles.tierEyebrow}>{plan.code}</p>
          <h3>{consumerFinanceTierLabel(plan.code, copy)}</h3>
          <p className={styles.positioning}>{positioning}</p>
        </div>
        <div className={styles.badges}>
          {featured ? (
            <span className={styles.popular}>{copy.mostPopular}</span>
          ) : null}
          {selected ? (
            <span className={styles.current}>{copy.currentPlan}</span>
          ) : null}
        </div>
      </header>

      <FinancePlanVisual tier={plan.code} />

      <div className={styles.purchaseBlock}>
        {plan.prices.length ? (
          <div className={styles.priceList}>
            {plan.prices.map((price, index) => (
              <p key={price.id} data-primary-price={index === 0 || undefined}>
                <strong>
                  {formatConsumerFinancePlanPrice(
                    price.amountMinor,
                    price.currency,
                    locale,
                  )}
                </strong>
                <span>
                  / {price.interval === "MONTH" ? copy.month : copy.year}
                </span>
              </p>
            ))}
          </div>
        ) : plan.code === "FREE" ? (
          <p className={styles.included}>{copy.included}</p>
        ) : (
          <p className={styles.unavailable}>{copy.unavailable}</p>
        )}

        {!selected && plan.canPurchase && offers.length ? (
          <>
            <Button
              className="min-h-11 w-full"
              disabled={checkoutPending}
              onClick={() => onChoose(plan, offers)}
            >
              {copy.choose}
            </Button>
            {paymentPlan === plan.code && offers.length > 1 ? (
              <div
                role="group"
                aria-label={copy.choosePaymentMethod}
                className={styles.paymentMethods}
              >
                <p>{copy.choosePaymentMethod}</p>
                <div className="grid gap-2">
                  {offers.map((offer) => (
                    <button
                      key={`${offer.price.id}-${offer.provider.provider}-${offer.provider.mode}`}
                      type="button"
                      disabled={checkoutPending}
                      onClick={() => onCheckout(offer)}
                    >
                      <span>
                        {offer.provider.provider === "TELEGRAM_STARS"
                          ? copy.payWithTelegramStars
                          : copy.payByCard}
                      </span>
                      <span>
                        {formatConsumerFinancePlanPrice(
                          offer.price.amountMinor,
                          offer.price.currency,
                          locale,
                        )}{" "}
                        /{" "}
                        {offer.price.interval === "MONTH"
                          ? copy.month
                          : copy.year}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : selected ? null : plan.prices.length ? (
          <p className={styles.unavailable}>{copy.unavailable}</p>
        ) : null}
      </div>

      <ul className={styles.featureList}>
        {plan.features.map((feature) => (
          <li key={feature}>
            <span className={styles.check} aria-hidden="true">
              <Check size={12} strokeWidth={2.5} />
            </span>
            <span>{consumerFinanceFeatureLabel(feature, plan, copy)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
