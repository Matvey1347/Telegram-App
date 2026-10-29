"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import {
  financeBillingApi,
  FinanceBillingHttpError,
  type FinanceBillingOfferCode,
} from "@finance-web/lib/billing/finance-billing-api";

type Translate = (uk: string, en: string) => string;
const offerNames: Record<FinanceBillingOfferCode, [string, string]> = {
  INTRO: ["3 дні", "3 days"],
  MONTH: ["1 місяць", "1 month"],
  QUARTER: ["3 місяці", "3 months"],
  YEAR: ["12 місяців", "12 months"],
};

const money = (minor: number, currency: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 100);

function redirect(url: string) {
  const target = new URL(url);
  if (target.protocol !== "https:" && !(target.protocol === "http:" && target.hostname === "localhost")) {
    throw new Error("Invalid billing destination");
  }
  window.location.assign(target.href);
}

export function FinanceBillingPanel({ botId, telegramInitData, identityScope, t, language = "uk" }: {
  botId: string;
  telegramInitData?: string;
  identityScope?: string;
  t: Translate;
  language?: string;
}) {
  const [selected, setSelected] = useState<FinanceBillingOfferCode>("MONTH");
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const locale = language === "en" ? "en-US" : "uk-UA";
  const billing = useQuery({
    queryKey: ["finance", botId, "billing", identityScope ?? "browser"],
    queryFn: async () => {
      try {
        return await financeBillingApi.get(botId);
      } catch (error) {
        if (!(error instanceof FinanceBillingHttpError) || ![401, 403].includes(error.status) || !telegramInitData) throw error;
        const session = await financeBillingApi.establishTelegramSession(botId, telegramInitData);
        if (!session.authenticated) throw new Error("Finance sign-in failed");
        return financeBillingApi.get(botId);
      }
    },
    retry: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const catalog = billing.data;
  const offers = catalog?.offers ?? [];
  const selectedOffer = offers.find((offer) => offer.code === selected && offer.available)
    ?? offers.find((offer) => offer.available);
  const introRenewalMinor = selectedOffer?.introNextAmountMinor
    ?? offers.find((offer) => offer.code === "MONTH")?.amountMinor;

  async function act(action: "checkout" | "portal" | "cancel" | "resume") {
    setPending(action);
    setActionError("");
    try {
      if (action === "checkout") {
        if (!selectedOffer) return;
        window.dispatchEvent(new CustomEvent("finance:checkout_start", { detail: { offerCode: selectedOffer.code } }));
        redirect((await financeBillingApi.checkout(botId, selectedOffer.code)).url);
      } else if (action === "portal") {
        redirect((await financeBillingApi.portal(botId)).url);
      } else {
        await financeBillingApi[action](botId);
        await billing.refetch();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("Дію не виконано.", "Action failed."));
    } finally {
      setPending(null);
    }
  }

  return <div className="finance-billing">
    <div className="title-area"><small>GROSHLY PLUS</small><h1>{t("Більше можливостей.", "More possibilities.")}</h1></div>
    <p className="sublead">{t("FREE для основних фінансів. PLUS відкриває всі платні можливості, незалежно від періоду оплати.", "FREE covers the essentials. PLUS unlocks every paid feature, regardless of billing period.")}</p>
    {billing.isPending && <div className="paper billing-message" role="status">{t("Завантажуємо тарифи…", "Loading plans…")}</div>}
    {billing.isError && <div className="paper billing-message" role="alert"><p>{t("Не вдалося завантажити оплату. Увійдіть до Finance та спробуйте знову.", "Unable to load billing. Sign in to Finance and try again.")}</p><button type="button" onClick={() => void billing.refetch()}>{t("Повторити", "Retry")}</button></div>}
    {catalog && <>
      <section className="paper billing-current" aria-label={t("Поточний доступ", "Current access")}>
        <div><small>{t("ПОТОЧНИЙ ДОСТУП", "CURRENT ACCESS")}</small><strong>{catalog.tier}</strong></div>
        {catalog.activeUntil && <p>{catalog.cancelAtPeriodEnd ? t("Доступ до", "Access until") : t("Активний до", "Active until")} {new Date(catalog.activeUntil).toLocaleDateString(locale)}</p>}
        {catalog.subscription?.status === "PAST_DUE" && <p role="status">{t("Оплату не отримано. Щоб оновити спосіб оплати, зверніться до підтримки: ", "Payment is overdue. To update your payment method, contact support: ")}<a href="mailto:matveybogdantg@gmail.com">matveybogdantg@gmail.com</a></p>}
        {catalog.tier === "FREE" && catalog.subscription?.source === "STRIPE" && catalog.subscription.status === "ACTIVE" && <p role="status">{t("Після повернення коштів доступ PLUS призупинено. Підписка ще діє у Stripe: керуйте нею через платіжний портал. Доступ відновиться після підтвердженого нового платежу; новий тариф можна оформити після завершення цієї підписки.", "PLUS access is suspended after a refund. Your Stripe subscription is still active: manage it in the billing portal. Access resumes after a new confirmed payment; you can start a new plan once this subscription ends.")}</p>}
        {catalog.subscription?.source === "GIFT" && <p>{t("Подарований доступ PLUS", "Gifted PLUS access")}</p>}
        {catalog.subscription?.source === "STRIPE" && <div className="billing-manage">
          {!telegramInitData && <button type="button" disabled={!!pending} onClick={() => void act("portal")}>{t("Платежі та картка", "Payments and card")}</button>}
          {catalog.cancelAtPeriodEnd
            ? <button type="button" disabled={!!pending} onClick={() => void act("resume")}>{t("Відновити продовження", "Resume renewal")}</button>
            : <button type="button" disabled={!!pending} onClick={() => void act("cancel")}>{t("Скасувати продовження", "Cancel renewal")}</button>}
        </div>}
      </section>
      <div className="eyebrow block-mt">{t("ТЕРМІН ПІДПИСКИ", "BILLING PERIOD")}</div>
      <div className="billing-options" role="radiogroup" aria-label={t("Варіант PLUS", "PLUS billing option")}>
        {offers.map((offer) => <button type="button" role="radio" aria-checked={selectedOffer?.code === offer.code} key={offer.code} disabled={!offer.available || !!pending} className={`billing-option ${selectedOffer?.code === offer.code ? "on" : ""}`} onClick={() => setSelected(offer.code)}>
          <span className="radio-circle">{selectedOffer?.code === offer.code && <span />}</span>
          <span><b>{t(...offerNames[offer.code])}</b><small>{offer.intervalLabel}{!offer.available && ` · ${t("недоступно", "unavailable")}`}</small></span>
          <strong>{money(offer.amountMinor, offer.currency, locale)}</strong>
        </button>)}
      </div>
      {!offers.length && <p className="paper billing-message">{t("Варіанти оплати зараз недоступні.", "Billing options are currently unavailable.")}</p>}
      {selectedOffer?.code === "INTRO" && <p className="paper billing-disclosure">{introRenewalMinor !== undefined
        ? `${t("Зараз", "Pay")} ${money(selectedOffer.amountMinor, "UAH", locale)} ${t("за 3 дні. Потім підписка автоматично продовжується за", "for 3 days now. Your subscription then renews automatically at")} ${money(introRenewalMinor, "UAH", locale)} ${t("щомісяця, доки ви її не скасуєте.", "per month until you cancel.")}`
        : t("Місячна ціна тимчасово недоступна. Спробуйте пізніше.", "Monthly renewal price is unavailable. Please try later.")}</p>}
      <div className="paper subscription-footer">
        <div className="sub-state"><ShieldCheck size={19}/>{telegramInitData
          ? t("Купівля цифрового доступу в Telegram Mini App недоступна. Тут можна переглянути стан підписки та історію платежів.", "Digital access cannot be purchased in the Telegram Mini App. You can view subscription status and payment history here.")
          : t("Оплата через захищений Stripe Checkout. PLUS активується після підтвердження платежу.", "Secure Stripe Checkout. PLUS starts after payment is confirmed.")}</div>
        {!telegramInitData && <button type="button" className="btn primary full" disabled={!selectedOffer || !!pending || (selectedOffer.code === "INTRO" && introRenewalMinor === undefined)} onClick={() => void act("checkout")}>{pending === "checkout" ? t("Переходимо до оплати…", "Opening checkout…") : t("Оформити PLUS", "Get PLUS")} <ArrowRight size={18}/></button>}
      </div>
      {actionError && <p role="alert" className="billing-error">{actionError}</p>}
      <section className="paper billing-history" aria-label={t("Історія платежів", "Payment history")}>
        <h2>{t("Історія платежів", "Payment history")}</h2>
        {catalog.history.length === 0 ? <p>{t("Платежів поки немає.", "No payments yet.")}</p> : <ul>{catalog.history.map((item) => <li key={item.id}>
          <span><b>{({ PAYMENT_SUCCEEDED: t("Оплачено", "Paid"), PAYMENT_FAILED: t("Помилка оплати", "Payment failed"), REFUND: t("Повернення", "Refund"), CHARGEBACK: t("Оскарження", "Chargeback") })[item.kind]}</b><small>{new Date(item.occurredAt).toLocaleDateString(locale)}</small></span>
          <strong>{money(item.amountMinor, item.currency, locale)}</strong>
        </li>)}</ul>}
        <button type="button" className="billing-refresh" onClick={() => void billing.refetch()} disabled={billing.isFetching}><RefreshCw size={16}/>{t("Оновити", "Refresh")}</button>
      </section>
    </>}
  </div>;
}
