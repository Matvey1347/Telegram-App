"use client";

import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { type PropsWithChildren, useState } from "react";
import { FinanceFeedbackProvider } from "@/components/features/finance/consumer-finance/ui/finance-feedback";
import financeStyles from "@/components/features/finance/consumer-finance/ui/finance-ui.module.css";

/** Consumer Finance owns an in-memory, bot-scoped cache and local feedback UI. */
export function ConsumerFinanceProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 4 * 60_000,
            gcTime: 45 * 60_000,
            placeholderData: keepPreviousData,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );
  return (
    <div
      data-consumer-finance-theme="neutral-blue"
      className={`${financeStyles.themeRoot} min-h-full bg-neutral-950 text-white`}
    >
      <QueryClientProvider client={queryClient}>
        <FinanceFeedbackProvider>{children}</FinanceFeedbackProvider>
      </QueryClientProvider>
    </div>
  );
}
