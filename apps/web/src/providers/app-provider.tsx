"use client";

import { PropsWithChildren, Suspense } from "react";
import { ProtectedRoute } from "@/components/features/identity/auth/protected-route";
import type { AppLocale } from "@/i18n/types";
import { ClientErrorReporter } from "./client-error-reporter";
import { I18nProvider } from "./i18n-provider";
import { NotificationNavigationCoordinator } from "./notification-navigation-coordinator";
import { NotificationServiceWorkerProvider } from "./notification-service-worker-provider";
import { QueryProvider } from "./query-provider";
import { TabIdentityProvider } from "./tab-identity-provider";
import { ToastProvider } from "./toast-provider";

export function AppProvider({
  children,
  initialLocale = "en",
}: PropsWithChildren<{ initialLocale?: AppLocale }>) {
  return (
    <I18nProvider initialLocale={initialLocale}>
      <QueryProvider>
        <NotificationServiceWorkerProvider>
          <ToastProvider>
            <Suspense
              fallback={
                <ClientErrorReporter>
                  <ProtectedRoute>{children}</ProtectedRoute>
                </ClientErrorReporter>
              }
            >
              <TabIdentityProvider>
                <ClientErrorReporter>
                  <ProtectedRoute>
                    <NotificationNavigationCoordinator>
                      {children}
                    </NotificationNavigationCoordinator>
                  </ProtectedRoute>
                </ClientErrorReporter>
              </TabIdentityProvider>
            </Suspense>
          </ToastProvider>
        </NotificationServiceWorkerProvider>
      </QueryProvider>
    </I18nProvider>
  );
}
