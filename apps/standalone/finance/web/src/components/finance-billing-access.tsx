"use client";

import { useState } from "react";
import { ChartNoAxesCombined, Crown, Gift, Sparkles } from "lucide-react";
import type { financeBillingApi } from "@finance-web/lib/billing/finance-billing-api";
import { money, offerCode, offerNames } from "./finance-billing-format";

type Translate = (uk: string, en: string) => string;
type Catalog = Awaited<ReturnType<typeof financeBillingApi.get>>;

export function FinancePlusBenefits({ t }: { t: Translate }) {
  return (
    <section
      className="billing-benefits"
      aria-label={t("Можливості Plus", "What Plus includes")}
    >
      <article className="paper">
        <Sparkles size={22} aria-hidden />
        <div>
          <h2>{t("AI-асистент", "AI assistant")}</h2>
          <p>
            {t(
              "Запитуйте про свої витрати, доходи чи операції. Асистент відповідає на основі ваших даних і може підготувати новий запис із тексту або голосового повідомлення для вашого підтвердження.",
              "Ask about your spending, income, or transactions. The assistant answers using your financial data and can draft a new transaction from text or a voice message for you to confirm.",
            )}
          </p>
        </div>
      </article>
      <article className="paper">
        <ChartNoAxesCombined size={22} aria-hidden />
        <div>
          <h2>{t("Розширена аналітика", "Advanced analytics")}</h2>
          <p>
            {t(
              "Запитуйте, чому змінилися витрати, які категорії найбільше вплинули на бюджет і де можна заощадити. Асистент підсумує тенденції за вибраний період.",
              "Ask what drove changes in spending, which categories had the biggest impact on your budget, or where you could save. The assistant summarizes trends for the period you choose.",
            )}
          </p>
        </div>
      </article>
    </section>
  );
}

export function FinanceBillingAccess({
  catalog,
  inTelegram,
  pending,
  returnedFromCheckout,
  onAction,
  t,
  locale,
}: {
  catalog: Catalog;
  inTelegram: boolean;
  pending: boolean;
  returnedFromCheckout: boolean;
  onAction: (
    action: "portal" | "cancel" | "resume" | "changePlan",
    priceId?: string,
  ) => Promise<void>;
  t: Translate;
  locale: string;
}) {
  const [changing, setChanging] = useState(false);
  const { gift, stripe } = catalog.activeAccess ?? {};
  const currentCode =
    stripe && offerCode(stripe.interval, stripe.intervalCount);
  const renewal = stripe?.renewal;
  const renewalCode =
    renewal && offerCode(renewal.interval, renewal.intervalCount);
  const alternatives = catalog.offers.filter(
    (offer) =>
      offer.code !== "INTRO" &&
      offer.code !== currentCode &&
      offer.version > 0 &&
      offer.mode,
  );
  const date = (value: string) =>
    new Date(value).toLocaleDateString(locale, { dateStyle: "medium" });
  const canChange =
    stripe?.canChangePlan && alternatives.length > 0 && !inTelegram;

  return (
    <section
      className="paper billing-current"
      aria-label={t("Поточний доступ", "Current access")}
    >
      <div>
        <small>{t("Поточний доступ", "Current access")}</small>
        <strong className="billing-brand">
          {catalog.tier === "PLUS" && <Crown size={20} aria-hidden />}
          {catalog.tier === "PLUS" ? "Plus" : "Free"}
        </strong>
      </div>
      {returnedFromCheckout && catalog.tier === "FREE" && (
        <p role="status">
          {t(
            "Очікуємо підтвердження від Stripe.",
            "Waiting for Stripe confirmation.",
          )}
        </p>
      )}
      {gift && (
        <div className="billing-gift">
          <Gift size={20} aria-hidden />
          <div>
            <b>{t("Подарункова підписка", "Gift subscription")}</b>
            <div>
              {gift.expiresAt
                ? `${t("Подарунок діє до", "Gift access until")} ${date(gift.expiresAt)}`
                : t("Безстроковий доступ", "Lifetime access")}
            </div>
          </div>
        </div>
      )}
      {stripe && (
        <dl className="billing-details">
          {currentCode && (
            <div>
              <dt>{t("Поточний період", "Current billing period")}</dt>
              <dd>{t(...offerNames[currentCode])}</dd>
            </div>
          )}
          {stripe.cancelAtPeriodEnd ? (
            <div>
              <dt>{t("Оплачений доступ до", "Paid access until")}</dt>
              <dd>{date(stripe.currentPeriodEnd)}</dd>
            </div>
          ) : renewal ? (
            <>
              <div>
                <dt>{t("Наступне списання", "Next charge")}</dt>
                <dd>{date(renewal.chargeAt)}</dd>
              </div>
              <div>
                <dt>{t("Сума наступного списання", "Next charge amount")}</dt>
                <dd>{money(renewal.amountMinor, renewal.currency, locale)}</dd>
              </div>
              {renewalCode && (
                <div>
                  <dt>{t("Період продовження", "Renewal period")}</dt>
                  <dd>{t(...offerNames[renewalCode])}</dd>
                </div>
              )}
            </>
          ) : (
            <div>
              <dt>{t("Наступне списання", "Next charge")}</dt>
              <dd>
                {t(
                  "Дані Stripe тимчасово недоступні",
                  "Stripe details are temporarily unavailable",
                )}
              </dd>
            </div>
          )}
        </dl>
      )}
      {!gift && !stripe && catalog.activeUntil && (
        <p>
          {t("Доступ до", "Access until")} {date(catalog.activeUntil)}
        </p>
      )}
      {catalog.hasOverduePayment && (
        <p role="status">
          {t(
            "Stripe не зміг отримати оплату.",
            "Stripe could not collect your payment.",
          )}
        </p>
      )}
      {(stripe?.canManageRenewal || catalog.hasOverduePayment) && (
        <div className="billing-manage">
          {canChange && (
            <button
              type="button"
              aria-expanded={changing}
              onClick={() => setChanging(!changing)}
              disabled={pending}
            >
              {t("Змінити план", "Change plan")}
            </button>
          )}
          {!inTelegram && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void onAction("portal")}
            >
              {t("Платежі та картка", "Payments and card")}
            </button>
          )}
          {stripe?.canManageRenewal && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void onAction(stripe.cancelAtPeriodEnd ? "resume" : "cancel")
              }
            >
              {stripe.cancelAtPeriodEnd
                ? t("Відновити продовження", "Resume renewal")
                : t("Скасувати продовження", "Cancel renewal")}
            </button>
          )}
        </div>
      )}
      {canChange && changing && (
        <div
          className="billing-manage"
          role="group"
          aria-label={t("Варіанти зміни плану", "Plan change options")}
        >
          {alternatives.map((offer) => (
            <button
              key={offer.id}
              type="button"
              disabled={pending}
              onClick={() => void onAction("changePlan", offer.id)}
            >
              {t(...offerNames[offer.code])} ·{" "}
              {money(offer.amountMinor, offer.currency, locale)}
            </button>
          ))}
          <p>
            {t(
              "Stripe покаже умови зміни перед підтвердженням.",
              "Stripe shows the terms before you confirm the change.",
            )}
          </p>
        </div>
      )}
    </section>
  );
}
