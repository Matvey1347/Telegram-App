"use client";
import { useAiText } from "./ai-copy";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { aiApi } from "@/lib/features/operations/ai-api";
import { aiKeys, aiQueryPolicy } from "@/lib/features/operations/ai-query-keys";
import { aiCategory, aiCost, aiMoney, aiPermissions } from "./ai-format";
export function CrmAiUsage() {
  const t = useAiText();
  const [open, setOpen] = useState(false);
  const me = useQuery({
    queryKey: authKeys.me(),
    queryFn: authApi.me,
    staleTime: 300_000,
  });
  const workspaceId = me.data?.workspace.id ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const filter = {
    workspaceId,
    scope: "SALES" as const,
    from: `${today.slice(0, 7)}-01`,
    to: today,
  };
  const allowed = aiPermissions(me.data?.workspace.access).view;
  const usage = useQuery({
    queryKey: aiKeys.usage(workspaceId, filter),
    queryFn: () => aiApi.usage(filter),
    enabled: open && allowed && !!workspaceId,
    ...aiQueryPolicy,
  });
  if (!allowed) return null;
  return (
    <div className="border-t border-neutral-800 px-4 py-2">
      <button
        className="min-h-10 text-sm text-blue-300"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        AI Usage {open ? "−" : "+"}
      </button>
      {open ? (
        <div className="space-y-2 pb-3 text-sm">
          {usage.isLoading ? (
            <p role="status">{t("Loading sales usage…")}</p>
          ) : usage.isError ? (
            <p role="alert">
              Sales usage could not be loaded.{" "}
              <button
                className="text-blue-300"
                onClick={() => void usage.refetch()}
              >
                {t("Retry")}
              </button>
            </p>
          ) : usage.data ? (
            <>
              <p>
                This month · {aiCost(usage.data.summary.selected)} ·{" "}
                {usage.data.summary.selected.requests} requests
              </p>
              {usage.data.byFeature.map((v) => (
                <p key={v.category} className="text-xs text-neutral-400">
                  {aiCategory(v.category)} · Average{" "}
                  {aiMoney(v.averageKnownCost)}
                </p>
              ))}
            </>
          ) : null}
          <Link
            className="inline-flex min-h-10 items-center text-blue-300"
            href="/settings/ai-usage"
          >
            {t("Open system AI Usage →")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
