"use client";

import { Button, Card } from "./ui";
import { useState } from "react";
import type { FinanceLocale } from "./i18n/core";
import { financeAuthCopy } from "./i18n/auth";
import type { ConsumerFinanceScreen } from "./consumer-finance-navigation";

type TourStep =
  | "overview"
  | "transactions"
  | "analytics"
  | "choice"
  | "accounts"
  | "categories"
  | "transfers"
  | "jarvis";

export function FinanceOnboardingTour({
  locale,
  onNavigate,
  onFinish,
}: {
  locale: FinanceLocale;
  onNavigate: (screen: ConsumerFinanceScreen) => void;
  onFinish: () => void;
}) {
  const t = financeAuthCopy(locale);
  const [step, setStep] = useState<TourStep>("overview");
  const advance = (next: TourStep, screen?: ConsumerFinanceScreen) => {
    if (screen) onNavigate(screen);
    setStep(next);
  };
  const content: Record<
    Exclude<TourStep, "choice">,
    {
      title: string;
      text: string;
      next: TourStep;
      screen: ConsumerFinanceScreen;
    }
  > = {
    overview: {
      title: t.overview,
      text: t.tourOverview,
      next: "transactions",
      screen: "home",
    },
    transactions: {
      title: t.transactions,
      text: t.tourTransactions,
      next: "analytics",
      screen: "transactions",
    },
    analytics: {
      title: t.analytics,
      text: t.tourAnalytics,
      next: "choice",
      screen: "analytics",
    },
    accounts: {
      title: t.accounts,
      text: t.tourAccounts,
      next: "categories",
      screen: "accounts",
    },
    categories: {
      title: t.categories,
      text: t.tourCategories,
      next: "transfers",
      screen: "categories",
    },
    transfers: {
      title: t.transfers,
      text: t.tourTransfers,
      next: "jarvis",
      screen: "transfers",
    },
    jarvis: {
      title: t.assistant,
      text: t.tourJarvis,
      next: "jarvis",
      screen: "assistant",
    },
  };
  const item = step === "choice" ? null : content[step];
  return (
    <div className="fixed inset-0 z-50 pointer-events-none bg-black/35">
      <Card className="pointer-events-auto absolute bottom-24 left-4 right-4 mx-auto max-w-md space-y-4 border-sky-700 bg-neutral-900 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">
          Finance tour
        </p>
        <h2 className="text-xl font-semibold">
          {item?.title ?? t.tourDetails}
        </h2>
        <p className="text-sm leading-6 text-neutral-300">
          {item?.text ?? t.tourDetails}
        </p>
        {step === "choice" ? (
          <div className="grid gap-2">
            <Button onClick={() => advance("accounts", "accounts")}>
              {t.tourDetailed}
            </Button>
            <Button variant="outline" onClick={() => advance("jarvis", "home")}>
              {t.tourFinish}
            </Button>
          </div>
        ) : step === "jarvis" ? (
          <Button className="w-full" onClick={onFinish}>
            {t.finish}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={() =>
              advance(
                item!.next,
                item!.next === "choice"
                  ? undefined
                  : content[item!.next as Exclude<TourStep, "choice">]?.screen,
              )
            }
          >
            {t.onboardingNext}
          </Button>
        )}
      </Card>
    </div>
  );
}
