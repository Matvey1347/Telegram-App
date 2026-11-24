"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { financeAuthCopy } from "@consumer-finance/web/components/i18n/auth";
import { normalizeFinanceLocale } from "@consumer-finance/web/components/i18n/core";
import { consumerFinanceAuthApi } from "@consumer-finance/web/lib/api/consumer-finance-auth-api";
import { consumerFinanceKeys } from "@consumer-finance/web/lib/query/consumer-finance-query-keys";
import { clearPersistedConsumerFinanceQueryCache } from "@consumer-finance/web/provider/consumer-finance-provider";

export function GroshlySignOut({ botId, locale }: { botId: string; locale: string }) {
  const client = useQueryClient();
  const copy = financeAuthCopy(normalizeFinanceLocale(locale));
  const logout = useMutation({
    mutationFn: () => consumerFinanceAuthApi.logout(botId),
    onSuccess: async () => {
      const queryKey = consumerFinanceKeys.root(botId);
      await client.cancelQueries({ queryKey });
      client.removeQueries({ queryKey });
      clearPersistedConsumerFinanceQueryCache();
      window.location.replace("/login");
    },
  });

  return (
    <div className="setting-group">
      <button type="button" className="setting-row danger" disabled={logout.isPending} onClick={() => logout.mutate()}>
        <LogOut size={21} aria-hidden="true" />
        <span>{logout.isPending ? copy.groshlySigningOut : copy.signOut}</span>
      </button>
      {logout.isError && <p role="alert" className="groshly-sign-out-error">{copy.groshlySignOutError}</p>}
    </div>
  );
}
