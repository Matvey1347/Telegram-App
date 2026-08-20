"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Landmark,
  List,
  ChartNoAxesCombined,
  Settings,
  WalletCards,
  ExternalLink,
} from "lucide-react";
import { Button, LoadingState } from "@/components/ui/primitives";
import {
  ConsumerFinanceScreens,
  type ConsumerFinanceScreen,
} from "./consumer-finance-screens";
import { useTelegramMiniAppBootstrap } from "./use-telegram-mini-app-bootstrap";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/query-keys";
import { ConsumerFinanceBootstrapError, ConsumerFinanceLogin } from "./consumer-finance-login";

const NAV = [
  { id: "home", label: "Home", Icon: Landmark },
  { id: "transactions", label: "Transactions", Icon: List },
  { id: "analytics", label: "Analytics", Icon: ChartNoAxesCombined },
  { id: "accounts", label: "Accounts", Icon: WalletCards },
  { id: "settings", label: "Settings", Icon: Settings },
] as const;

export function ConsumerFinanceApp({ botId }: { botId: string }) {
  const bootstrap = useTelegramMiniAppBootstrap();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: consumerFinanceKeys.settings(botId),
    queryFn: () => consumerFinanceApi.session(botId),
    retry: false,
  });
  const telegramAuth = useMutation({
    mutationFn: (initData: string) => consumerFinanceApi.auth(botId, initData),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: consumerFinanceKeys.settings(botId) }),
  });
  const browserTransfer = useMutation({
    mutationFn: () => consumerFinanceApi.createBrowserTransfer(botId),
    onSuccess: ({ token }) => {
      const url = consumerFinanceApi.browserTransferUrl(botId, token);
      const webApp = window.Telegram?.WebApp;
      if (webApp?.openLink) webApp.openLink(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    },
  });
  useEffect(() => {
    if (session.isError && bootstrap.status === "ready" && !telegramAuth.isPending && !telegramAuth.isSuccess) {
      telegramAuth.mutate(bootstrap.initData);
    }
  }, [bootstrap, session.isError, telegramAuth]);
  const [screen, setScreen] = useState<ConsumerFinanceScreen>(() => {
    if (typeof window === "undefined") return "home";
    const params = new URLSearchParams(window.location.search);
    const requestedScreen = params.get("screen");
    if (
      requestedScreen === "transactions" ||
      requestedScreen === "accounts" ||
      requestedScreen === "analytics" ||
      requestedScreen === "settings" ||
      requestedScreen === "categories" ||
      requestedScreen === "budget"
    ) {
      return requestedScreen;
    }
    return "home";
  });
  const [openTransfer, setOpenTransfer] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("transfer") === "1",
  );
  if (session.isLoading || bootstrap.status === "loading")
    return (
      <Shell>
        <LoadingState text="Opening Finance…" />
      </Shell>
    );
  if (telegramAuth.isError)
    return <Shell><ConsumerFinanceBootstrapError onRetry={() => telegramAuth.reset()} /></Shell>;
  if (session.isError && bootstrap.status === "unsupported") return <ConsumerFinanceLogin botId={botId} />;
  if (session.isError || telegramAuth.isPending) return <Shell><LoadingState text="Opening Finance…" /></Shell>;
  return (
    <Shell>
      {bootstrap.status === "ready" ? (
        <div className="mb-3 flex justify-end">
          <Button
            variant="secondary"
            disabled={browserTransfer.isPending}
            onClick={() => browserTransfer.mutate()}
          >
            <ExternalLink size={16} />
            {browserTransfer.isPending ? "Opening…" : "Open in browser"}
          </Button>
        </div>
      ) : null}
      <ConsumerFinanceScreens
        botId={botId}
        screen={screen}
        onScreenChange={setScreen}
        openTransfer={openTransfer}
      />
      <nav
        aria-label="Finance navigation"
        className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-lg grid-cols-5 border-t border-neutral-800 bg-neutral-950/95 px-1 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
      >
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            aria-current={screen === id ? "page" : undefined}
            onClick={() => {
              setOpenTransfer(false);
              setScreen(id);
            }}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${screen === id ? "bg-sky-500/15 text-sky-200" : "text-neutral-500"}`}
          >
            <Icon size={18} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </nav>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-lg bg-neutral-950 px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] text-neutral-100">
      {children}
    </main>
  );
}
