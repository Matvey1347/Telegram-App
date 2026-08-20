"use client";

import { PropsWithChildren } from "react";
import { QueryProvider } from "./query-provider";
import { ToastProvider } from "./toast-provider";

/** The Mini App only needs query caching; it intentionally excludes internal auth. */
export function ConsumerFinanceProvider({ children }: PropsWithChildren) {
  return (
    <QueryProvider>
      <ToastProvider>{children}</ToastProvider>
    </QueryProvider>
  );
}
