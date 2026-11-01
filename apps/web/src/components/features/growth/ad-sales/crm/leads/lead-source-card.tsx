"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Settings2, ShieldCheck } from "lucide-react";
import type { LeadSourceView } from "@telegram-system/shared";
import { Button } from "@/components/ui/primitives";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { invalidateLeadResults, leadKeys, patchLeadEntity } from "@/lib/features/growth/lead-discovery-query";
import { displayLeadDate, leadSafeUrl } from "./lead-utils";
import { LeadSourceSettings } from "./lead-source-settings";

function sourceState(source: LeadSourceView) {
  if (source.lastErrorCode === "LEAD_CHANNEL_MEMBERSHIP_REQUIRED") return { label: "Нет подписки", detail: "Для этого приватного канала подключённый Telegram-аккаунт должен быть участником." };
  if (source.lastErrorCode === "LEAD_BROADCAST_CHANNEL_REQUIRED") return { label: "Не канал", detail: "Эта ссылка ведёт в чат или группу. Поиск настроен на публикации каналов." };
  if (source.lastErrorCode === "LEAD_INVITE_INVALID") return { label: "Ссылка недействительна", detail: "Приглашение истекло или было отозвано. Нужна действующая ссылка на канал." };
  if (source.lastErrorCode === "LEAD_CHANNEL_NOT_FOUND") return { label: "Канал не найден", detail: "Telegram не нашёл канал: его адрес мог измениться." };
  if (source.monitoringState === "ACCESS_LOST") return { label: "Нет доступа", detail: "Telegram не разрешает читать этот канал. Проверьте подписку аккаунта." };
  if (source.lastErrorCode === "LEAD_RESOLVED_CHANNEL_NOT_APPROVED") return { label: "Ожидает подключения", detail: "Доступ найден; требуется завершить настройку источника." };
  if (!source.accountId || !source.channelId) return { label: "Не подключён", detail: "Требуется подключение Telegram и проверка доступа." };
  if (source.monitoringState === "DISABLED") return { label: "Отключён", detail: "Поиск в этом источнике выключен." };
  if (source.accessType === "PUBLIC_CHANNEL") return { label: "Проверка вручную", detail: "Аккаунт не подписан. Кнопка «Обновить» проверяет последние публикации." };
  if (source.monitoringState === "ACTIVE") return { label: "Активен", detail: "Новые публикации поступают из Telegram автоматически." };
  return { label: "На паузе", detail: "Автоматическое получение новых публикаций приостановлено." };
}

export function LeadSourceCard({ source, canManage, enabled }: { source: LeadSourceView; canManage: boolean; enabled: boolean }) {
  const client = useQueryClient();
  const [settings, setSettings] = useState(false);
  const state = sourceState(source);
  const connected = Boolean(source.accountId && source.channelId);
  const mutation = useMutation({
    mutationFn: async (action: "scan" | "validate" | "toggle") => {
      if (action === "scan") return leadDiscoveryApi.scan(source.id);
      if (action === "validate") return leadDiscoveryApi.validate(source.id);
      return leadDiscoveryApi.updateSource(source.id, { monitoringState: source.monitoringState === "ACTIVE" ? "PAUSED" : "ACTIVE" });
    },
    onSuccess: async (result) => {
      if ("id" in result) await patchLeadEntity(client, leadKeys.sourcesRoot(source.workspaceId), result);
      else await invalidateLeadResults(client, source.workspaceId);
    },
    retry: false,
  });
  const url = leadSafeUrl(source.url);
  return <article className="min-w-0 rounded-xl border border-neutral-800 bg-neutral-900/50 px-3 py-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium" title={source.title}>{url ? <a href={url} target="_blank" rel="noreferrer" className="hover:text-blue-300">{source.title}</a> : source.title}</h3>
        <p className="mt-1 text-xs text-neutral-400">{source.metrics.observedPosts} публикаций · {source.metrics.advertisements} рекламных · {source.metrics.uniqueCandidates} кандидатов</p>
      </div>
      <span className={`shrink-0 rounded px-2 py-1 text-xs ${source.monitoringState === "ACTIVE" ? "bg-emerald-950 text-emerald-300" : "bg-neutral-800 text-neutral-300"}`}>{state.label}</span>
    </div>
    <p className="mt-2 text-xs text-neutral-400">{state.detail}</p>
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <span className="mr-auto text-neutral-500">Последняя публикация: {displayLeadDate(source.lastObservedAt)}</span>
      {canManage ? <>
        <Button variant="secondary" disabled={!enabled || !connected || mutation.isPending} onClick={() => mutation.mutate("scan")} className="!min-h-8 !px-3 !py-1 !text-xs">{mutation.isPending ? "Проверяем…" : "Обновить"}</Button>
        <ActionMenu label={`Действия источника ${source.title}`} triggerClassName="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800" menuClassName="absolute right-0 top-9 z-40 w-64 rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-xl">
          <ActionMenuItem icon={<ShieldCheck size={14}/>} disabled={!enabled || mutation.isPending || !source.accountId} onClick={() => mutation.mutate("validate")}>Проверить доступ</ActionMenuItem>
          {connected && source.accessType !== "PUBLIC_CHANNEL" ? <ActionMenuItem disabled={!enabled || mutation.isPending} icon={source.monitoringState === "ACTIVE" ? <Pause size={14}/> : <Play size={14}/>} onClick={() => mutation.mutate("toggle")}>{source.monitoringState === "ACTIVE" ? "Приостановить" : "Продолжить мониторинг"}</ActionMenuItem> : null}
          <ActionMenuItem icon={<Settings2 size={14}/>} onClick={() => setSettings(true)}>Настройки подключения</ActionMenuItem>
        </ActionMenu>
      </> : null}
    </div>
    {mutation.isError ? <p role="alert" className="mt-2 text-xs text-amber-200">Не удалось обновить источник. Проверьте доступ аккаунта к каналу и повторите.</p> : null}
    {mutation.data && !("id" in mutation.data) ? <p role="status" className="mt-2 text-xs text-neutral-400">Проверено {mutation.data.received} · Новых или обновлённых {mutation.data.changed}</p> : null}
    {settings ? <LeadSourceSettings source={source} onClose={() => setSettings(false)}/> : null}
  </article>;
}
