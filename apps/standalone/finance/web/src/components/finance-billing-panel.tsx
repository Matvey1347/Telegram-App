"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Mic,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  financeBillingApi,
  type FinanceBillingOfferCode,
} from "@finance-web/lib/billing/finance-billing-api";

type Translate = (uk: string, en: string) => string;
const offerNames: Record<FinanceBillingOfferCode, [string, string]> = {
  INTRO: ["7 днів", "7 days"],
  MONTH: ["1 місяць", "1 month"],
  QUARTER: ["3 місяці", "3 months"],
  YEAR: ["12 місяців", "12 months"],
};

const money = (minor: number, currency: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    minor / 100,
  );

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
    queryKey: ["finance", botId, "billing", identityScope ?? "browser"],
    queryFn: () => financeBillingApi.get(botId),
    retry: false,
    refetchOnMount: "always",
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

  async function act(action: "checkout" | "portal" | "cancel" | "resume") {
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
      } else if (action === "portal") {
        redirect((await financeBillingApi.portal(botId)).url);
      } else {
        await financeBillingApi[action](botId);
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
        <small>GROSHLY PLUS</small>
        <h1>{t("Більше можливостей.", "More possibilities.")}</h1>
      </div>
      <p className="sublead">
        {t(
          "FREE для основних фінансів. PLUS відкриває всі платні можливості, незалежно від періоду оплати.",
          "FREE covers the essentials. PLUS unlocks every paid feature, regardless of billing period.",
        )}
      </p>
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
          <section
            className="paper billing-current"
            aria-label={t("Поточний доступ", "Current access")}
          >
            <div>
              <small>{t("ПОТОЧНИЙ ДОСТУП", "CURRENT ACCESS")}</small>
              <strong>{catalog.tier}</strong>
            </div>
            {returnedFromCheckout && catalog.tier === "FREE" && (
              <p role="status">
                {t(
                  "Очікуємо підтвердження від Stripe.",
                  "Waiting for Stripe confirmation.",
                )}
              </p>
            )}
            {catalog.activeUntil && (
              <p>
                {catalog.cancelAtPeriodEnd
                  ? t("Доступ до", "Access until")
                  : t("Активний до", "Active until")}{" "}
                {new Date(catalog.activeUntil).toLocaleDateString(locale)}
              </p>
            )}
            {catalog.subscription?.status === "PAST_DUE" && (
              <p role="status">
                {t(
                  "Оплату не отримано. Щоб оновити спосіб оплати, зверніться до підтримки: ",
                  "Payment is overdue. To update your payment method, contact support: ",
                )}
                <a href="mailto:matveybogdantg@gmail.com">
                  matveybogdantg@gmail.com
                </a>
              </p>
            )}
            {catalog.subscription?.source === "GIFT" && (
              <p>{t("Подарований доступ PLUS", "Gifted PLUS access")}</p>
            )}
            {catalog.subscription?.source === "STRIPE" && (
              <div className="billing-manage">
                {!telegramInitData && (
                  <button
                    type="button"
                    disabled={!!pending}
                    onClick={() => void act("portal")}
                  >
                    {t("Платежі та картка", "Payments and card")}
                  </button>
                )}
                {catalog.cancelAtPeriodEnd ? (
                  <button
                    type="button"
                    disabled={!!pending}
                    onClick={() => void act("resume")}
                  >
                    {t("Відновити продовження", "Resume renewal")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!!pending}
                    onClick={() => void act("cancel")}
                  >
                    {t("Скасувати продовження", "Cancel renewal")}
                  </button>
                )}
              </div>
            )}
          </section>
          <div
            className="paper billing-manage"
            aria-label={t("Можливості PLUS", "What PLUS includes")}
          >
            <span>
              <Sparkles size={17} aria-hidden />{" "}
              {t(
                "AI-асистент та аналіз витрат",
                "AI assistant and spending insights",
              )}
            </span>
            <span>
              <Mic size={17} aria-hidden />{" "}
              {t("Голосове додавання операцій", "Voice entry")}
            </span>
            <span>
              <ReceiptText size={17} aria-hidden />{" "}
              {t("Сканування чеків", "Receipt scanning")}
            </span>
          </div>
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
                    {!offer.available && ` · ${t("недоступно", "unavailable")}`}
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
          {selectedOffer?.mode === "TEST" && !telegramInitData && (
            <p className="paper billing-disclosure">
              {t("Тестовий режим Stripe", "Stripe test mode")}
            </p>
          )}
          <div className="paper subscription-footer">
            <div className="sub-state">
              <ShieldCheck size={19} />
              {telegramInitData
                ? t(
                    "Купівля цифрового доступу в Telegram Mini App недоступна. Тут можна переглянути стан підписки та історію платежів.",
                    "Digital access cannot be purchased in the Telegram Mini App. You can view subscription status and payment history here.",
                  )
                : t(
                    "Оплата через захищений Stripe Checkout. PLUS активується після підтвердження платежу.",
                    "Secure Stripe Checkout. PLUS starts after payment is confirmed.",
                  )}
            </div>
            {!telegramInitData && (
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
            )}
          </div>
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
                        {item.status === "SUCCEEDED"
                          ? t("Оплачено", "Paid")
                          : t("Помилка оплати", "Payment failed")}
                      </b>
                      <small>
                        {new Date(item.occurredAt).toLocaleDateString(locale)}
                      </small>
                    </span>
                    <strong>
                      {item.amountMinor != null && item.currency
                        ? money(item.amountMinor, item.currency, locale)
                        : "—"}
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
