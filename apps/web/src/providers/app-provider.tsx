"use client";

import { PropsWithChildren, Suspense } from "react";
import { ProtectedRoute } from "@/components/features/identity/auth/protected-route";
import { ClientErrorReporter } from "./client-error-reporter";
import { QueryProvider } from "./query-provider";
import { TabIdentityProvider } from "./tab-identity-provider";
import { ToastProvider } from "./toast-provider";
import { NotificationNavigationCoordinator } from "./notification-navigation-coordinator";
import { NotificationServiceWorkerProvider } from "./notification-service-worker-provider";

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <QueryProvider>
      <NotificationServiceWorkerProvider>
        <ToastProvider>
          <Suspense
            fallback={
              <ClientErrorReporter>
                <ProtectedRoute>
                  <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-neutral-300">
                    Loading workspace…
                  </main>
                </ProtectedRoute>
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
  );
}
