"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Crown, Gift, RefreshCw, ShieldCheck } from "lucide-react";
import {
  financeBillingApi,
  type FinanceBillingOfferCode,
} from "@finance-web/lib/billing/finance-billing-api";

import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import {
  FinanceBillingAccess,
  FinancePlusBenefits,
} from "./finance-billing-access";
import {
  financeBillingPlanName,
  money,
  offerNames,
} from "./finance-billing-format";

type Translate = (uk: string, en: string) => string;
function redirect(url: string) {
  const target = new URL(url);
  if (
    target.protocol !== "https:" &&
    !(target.protocol === "http:" && target.hostname === "localhost")
  ) {
    throw new Error("Invalid billing destination");
  }
  window.location.assign(target.href);
}

export function FinanceBillingPanel({
  botId,
  telegramInitData,
  identityScope,
  t,
  language = "uk",
}: {
  botId: string;
  telegramInitData?: string;
  identityScope?: string;
  t: Translate;
  language?: string;
}) {
  const [returnedFromCheckout] = useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("checkout") === "success",
  );
  const [selected, setSelected] = useState<FinanceBillingOfferCode>("MONTH");
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const locale = language === "en" ? "en-US" : "uk-UA";
  const billing = useQuery({
    queryKey: [
      ...consumerFinanceKeys.billing(botId),
      identityScope ?? "browser",
    ],
    queryFn: () => financeBillingApi.get(botId),
    retry: false,
    staleTime: 30_000,
    refetchOnMount: returnedFromCheckout ? "always" : true,
    refetchOnWindowFocus: false,
  });
  const catalog = billing.data;
  const offers = catalog?.offers ?? [];
  const selectedOffer =
    offers.find((offer) => offer.code === selected && offer.available) ??
    offers.find((offer) => offer.available);
  const introRenewalMinor =
    selectedOffer?.introNextAmountMinor ??
    offers.find((offer) => offer.code === "MONTH")?.amountMinor;

  async function act(
    action: "checkout" | "portal" | "cancel" | "resume" | "changePlan",
    priceId?: string,
  ) {
    setPending(action);
    setActionError("");
    try {
      if (action === "checkout") {
        if (!selectedOffer) return;
        window.dispatchEvent(
          new CustomEvent("finance:checkout_start", {
            detail: { offerCode: selectedOffer.code },
          }),
        );
        redirect(
          (
            await financeBillingApi.checkout(
              botId,
              selectedOffer.id,
              selectedOffer.mode,
            )
          ).url,
        );
      } else if (action === "changePlan") {
        const subscriptionId = catalog?.activeAccess?.stripe?.id;
        if (subscriptionId && priceId)
          redirect(
            (await financeBillingApi.changePlan(botId, subscriptionId, priceId))
              .url,
          );
      } else if (action === "portal") {
        redirect((await financeBillingApi.portal(botId)).url);
      } else {
        await financeBillingApi[action](
          botId,
          catalog?.activeAccess?.stripe?.id,
        );
        await billing.refetch();
      }
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : t("Дію не виконано.", "Action failed."),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="finance-billing">
      <div className="title-area">
        <h1 className="billing-brand">
          <Crown size={28} aria-hidden /> Groshly Plus
        </h1>
      </div>
      {billing.isPending && (
        <div className="paper billing-message" role="status">
          {t("Завантажуємо тарифи…", "Loading plans…")}
        </div>
      )}
      {billing.isError && (
        <div className="paper billing-message" role="alert">
          <p>
            {t(
              "Не вдалося завантажити оплату. Увійдіть до Finance та спробуйте знову.",
              "Unable to load billing. Sign in to Finance and try again.",
            )}
          </p>
          <button type="button" onClick={() => void billing.refetch()}>
            {t("Повторити", "Retry")}
          </button>
        </div>
      )}
      {catalog && (
        <>
          <FinanceBillingAccess
            catalog={catalog}
            inTelegram={Boolean(telegramInitData)}
            pending={Boolean(pending)}
            returnedFromCheckout={returnedFromCheckout}
            onAction={act}
            t={t}
            locale={locale}
          />
          <FinancePlusBenefits t={t} />
          {catalog.tier === "FREE" &&
            !catalog.hasOverduePayment &&
            !telegramInitData && (
              <>
                <div className="eyebrow block-mt">
                  {t("ТЕРМІН ПІДПИСКИ", "BILLING PERIOD")}
                </div>
                <div
                  className="billing-options"
                  role="radiogroup"
                  aria-label={t("Варіант PLUS", "PLUS billing option")}
                >
                  {offers.map((offer) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selectedOffer?.code === offer.code}
                      key={offer.code}
                      disabled={!offer.available || !!pending}
                      className={`billing-option ${selectedOffer?.code === offer.code ? "on" : ""}`}
                      onClick={() => setSelected(offer.code)}
                    >
                      <span className="radio-circle">
                        {selectedOffer?.code === offer.code && <span />}
                      </span>
                      <span>
                        <b>{t(...offerNames[offer.code])}</b>
                        <small>
                          {offer.code === "QUARTER"
                            ? "−26%"
                            : offer.code === "YEAR"
                              ? "−49%"
                              : offer.code === "MONTH"
                                ? t("Рекомендуємо", "Recommended")
                                : ""}
                          {!offer.available &&
                            ` · ${t("недоступно", "unavailable")}`}
                        </small>
                      </span>
                      <strong>
                        {money(offer.amountMinor, offer.currency, locale)}
                      </strong>
                    </button>
                  ))}
                </div>
                {!offers.length && (
                  <p className="paper billing-message">
                    {t(
                      "Варіанти оплати зараз недоступні.",
                      "Billing options are currently unavailable.",
                    )}
                  </p>
                )}
                {selectedOffer?.code === "INTRO" && (
                  <p className="paper billing-disclosure">
                    {introRenewalMinor !== undefined
                      ? `${t("Зараз", "Pay")} ${money(selectedOffer.amountMinor, "UAH", locale)} ${t("за 7 днів. Потім підписка автоматично продовжується за", "for 7 days now. Your subscription then renews automatically at")} ${money(introRenewalMinor, "UAH", locale)} ${t("щомісяця, доки ви її не скасуєте.", "per month until you cancel.")}`
                      : t(
                          "Місячна ціна тимчасово недоступна. Спробуйте пізніше.",
                          "Monthly renewal price is unavailable. Please try later.",
                        )}
                  </p>
                )}
                {selectedOffer && selectedOffer.code !== "INTRO" && (
                  <p className="paper billing-disclosure">
                    {t(
                      "Підписка поновлюється автоматично. Після скасування доступ діє до кінця оплаченого періоду.",
                      "Your subscription renews automatically. If you cancel, access continues until the paid period ends.",
                    )}
                  </p>
                )}
                {selectedOffer?.mode === "TEST" && (
                  <p className="paper billing-disclosure">
                    {t("Тестовий режим Stripe", "Stripe test mode")}
                  </p>
                )}
                <div className="paper subscription-footer">
                  <div className="sub-state">
                    <ShieldCheck size={19} />
                    {t(
                      "Оплата через захищений Stripe Checkout. PLUS активується після підтвердження платежу.",
                      "Secure Stripe Checkout. PLUS starts after payment is confirmed.",
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn primary full"
                    disabled={
                      !selectedOffer ||
                      !!pending ||
                      (selectedOffer.code === "INTRO" &&
                        introRenewalMinor === undefined)
                    }
                    onClick={() => void act("checkout")}
                  >
                    {pending === "checkout"
                      ? t("Переходимо до оплати…", "Opening checkout…")
                      : t("Оформити PLUS", "Get PLUS")}{" "}
                    <ArrowRight size={18} />
                  </button>
                </div>
              </>
            )}
          {catalog.tier === "FREE" && telegramInitData && (
            <p className="paper billing-message">
              {t(
                "Придбати Plus можна у вебверсії Groshly.",
                "Digital access cannot be purchased in the Telegram Mini App. Subscribe on the Groshly website.",
              )}
            </p>
          )}
          {actionError && (
            <p role="alert" className="billing-error">
              {actionError}
            </p>
          )}
          <section
            className="paper billing-history"
            aria-label={t("Історія платежів", "Payment history")}
          >
            <h2>{t("Історія платежів", "Payment history")}</h2>
            {catalog.history.length === 0 ? (
              <p>{t("Платежів поки немає.", "No payments yet.")}</p>
            ) : (
              <ul>
                {catalog.history.map((item) => (
                  <li key={item.id}>
                    <span>
                      <b>
                        {item.status === "GIFTED"
                          ? t("Подаровано", "Gifted")
                          : item.status === "SUCCEEDED"
                            ? t("Оплачено", "Paid")
                            : t("Помилка оплати", "Payment failed")}
                      </b>
                      <small>
                        {item.status === "GIFTED" &&
                          item.planCode &&
                          `${financeBillingPlanName(item.planCode)} · `}
                        <time dateTime={item.occurredAt}>
                          {new Date(item.occurredAt).toLocaleDateString(
                            locale,
                            { dateStyle: "medium" },
                          )}
                        </time>
                      </small>
                    </span>
                    <strong>
                      {item.status === "GIFTED" ? (
                        <Gift size={19} aria-hidden />
                      ) : item.amountMinor != null && item.currency ? (
                        money(item.amountMinor, item.currency, locale)
                      ) : (
                        "—"
                      )}
                    </strong>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="billing-refresh"
              onClick={() => void billing.refetch()}
              disabled={billing.isFetching}
            >
              <RefreshCw size={16} />
              {t("Оновити", "Refresh")}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
