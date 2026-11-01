"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { authKeys } from "@/lib/query-keys";
import { aiApi } from "@/lib/features/operations/ai-api";
import { aiKeys, aiQueryPolicy } from "@/lib/features/operations/ai-query-keys";
import { aiCost, aiNumber, aiPermissions } from "./ai-format";

/** One workspace summary shared by Inbox and Discovery; refreshes after AI operations. */
export function CrmAiUsage() {
  const me = useQuery({ queryKey: authKeys.me(), queryFn: authApi.me, staleTime: 300_000 });
  const workspaceId = me.data?.workspace.id ?? "";
  const today = new Date().toISOString().slice(0, 10);
  const filter = { workspaceId, scope: "ALL" as const, from: `${today.slice(0, 7)}-01`, to: today };
  const allowed = aiPermissions(me.data?.workspace.access).view;
  const usage = useQuery({
    queryKey: aiKeys.usage(workspaceId, filter), queryFn: () => aiApi.usage(filter),
    enabled: allowed && !!workspaceId, ...aiQueryPolicy,
  });
  if (!allowed) return null;
  const totals = usage.data?.summary.selected;
  return <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-800 px-4 py-2 text-xs text-neutral-400" aria-label="AI Usage">
    <span className="font-medium text-neutral-200">AI Usage</span>
    {usage.isLoading ? <span role="status">Загрузка расходов…</span> : usage.isError ? <span role="alert">Расходы недоступны <button className="text-blue-300" onClick={() => void usage.refetch()}>Повторить</button></span> : totals ? <>
      <span className="font-medium tabular-nums text-neutral-200" title="Расходы за текущий месяц">{aiCost(totals)}</span>
      <span className="tabular-nums">{aiNumber(totals.totalTokens)} токенов</span>
      <span className="tabular-nums">{aiNumber(totals.requests)} запросов</span>
      {usage.data?.pendingRequests ? <span>{usage.data.pendingRequests} в обработке</span> : null}
    </> : <span>Нет данных о расходах</span>}
    <Link className="ml-auto inline-flex min-h-7 items-center text-blue-300 hover:text-blue-200" href="/settings/ai-usage">Статистика →</Link>
  </div>;
}
