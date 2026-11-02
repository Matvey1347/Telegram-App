"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Settings2, ShieldCheck, FileText, Megaphone, Users, Brain, Sparkles, Tag, Repeat2, Info } from "lucide-react";
import type { LeadSourceView } from "@telegram-system/shared";
import { Fragment } from "react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { Button } from "@/components/ui/primitives";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { invalidateLeadResults, leadKeys, patchLeadEntity } from "@/lib/features/growth/lead-discovery-query";
import { leadSafeUrl } from "./lead-utils";
import { LeadSourceSettings } from "./lead-source-settings";
import { LeadHistoryPanel } from "./lead-history-panel";
import { LeadSourceStatus } from "./lead-source-status";

export function sourceState(source: LeadSourceView) {
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
  const [history, setHistory] = useState(false);
  const state = sourceState(source);
  const ru = useOptionalI18n()?.locale !== "en";
  const parts = source.title.split(" · ");
  const channelName = parts.length > 1 ? parts[parts.length - 1] : source.title;
  const topic = parts.length > 1 ? parts.slice(0, -1).join(" · ") : "—";
  const topicParts = topic.split(" · ");
  const TopicIcon = /псих|psych/i.test(topic) ? Brain : /(?:^|\s)(?:ии|ai|ші)(?:\s|$)/i.test(topic) ? Sparkles : Tag;
  const avatar = source.username && /^[a-z][a-z0-9_]{3,31}$/i.test(source.username)
    ? { type: "image" as const, id: source.username, url: `https://t.me/i/userpic/320/${source.username}.jpg` }
    : null;
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
  return <Fragment><tr className="border-b border-neutral-800/80 last:border-0 hover:bg-neutral-900/60">
    <td className="px-4 py-3"><div className="flex min-w-0 items-center gap-3"><IconAvatar icon={avatar} label={channelName} size="sm" className="!rounded-full" decorative /><div className="min-w-0"><h3 className="max-w-72 truncate text-sm font-medium" title={channelName}>{url ? <a href={url} target="_blank" rel="noreferrer" className="hover:text-blue-300">{channelName}</a> : channelName}</h3>{source.username ? <span className="text-xs text-neutral-500">@{source.username}</span> : null}{source.coverageFrom ? <span className="block text-xs text-neutral-500">{ru ? "Публикации с" : "Posts from"} {new Date(source.coverageFrom).toLocaleDateString(ru ? "ru-RU" : "en-US")}</span> : null}</div></div></td>
    <td className="px-4 py-3 text-sm"><span className="inline-flex items-center gap-1.5 rounded-md bg-blue-950/60 px-2 py-1 text-blue-300"><TopicIcon size={14} aria-hidden="true" /><span>{topicParts[0]}</span>{topicParts.length > 1 ? <span tabIndex={0} title={topicParts.slice(1).join(" · ")} aria-label={topicParts.slice(1).join(" · ")}><Info size={14} /></span> : null}</span></td>
    <td className="px-4 py-3"><span className="inline-flex items-center gap-2 text-sm text-neutral-200" title={ru ? "Публикации" : "Posts"}><FileText size={16} className="text-neutral-500" />{source.metrics.observedPosts}</span></td>
    <td className="px-4 py-3"><span className="inline-flex items-center gap-2 text-sm text-neutral-200" title={ru ? "Рекламные публикации" : "Advertisements"}><Megaphone size={16} className="text-amber-400" />{source.metrics.advertisements}</span></td>
    <td className="px-4 py-3"><span className="inline-flex items-center gap-2 text-sm text-neutral-200" title={ru ? "Взаимопиар" : "Mutual promotion"}><Repeat2 size={16} className="text-violet-400" />{source.metrics.mutualPromotions ?? "—"}</span></td>
    <td className="px-4 py-3"><span className="inline-flex items-center gap-2 text-sm text-neutral-200" title={ru ? "Кандидаты" : "Candidates"}><Users size={16} className="text-blue-400" />{source.metrics.uniqueCandidates}</span></td>
    <td className="px-4 py-3"><span title={state.detail}><LeadSourceStatus active={state.label === "Активен"}>{ru ? state.label : state.label === "Активен" ? "Active" : source.monitoringState === "PAUSED" ? "Paused" : source.monitoringState === "ACCESS_LOST" ? "No access" : "Inactive"}</LeadSourceStatus></span></td>
    <td className="whitespace-nowrap px-4 py-3 text-xs text-neutral-400">{source.lastObservedAt ? new Date(source.lastObservedAt).toLocaleString(ru ? "ru-RU" : "en-US") : "—"}</td>
    <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{canManage ? <>
        <Button disabled={!enabled || !connected} onClick={() => setHistory(!history)} aria-expanded={history} className="!min-h-8 !px-2 !py-1 !text-xs">{ru ? "История" : "History"}<span className="sr-only"> {ru ? "за 90 дней" : "90 days"}</span></Button>
        <Button disabled={!enabled || !connected || mutation.isPending} onClick={() => mutation.mutate("scan")} className="!min-h-8 !px-2 !py-1 !text-xs">{mutation.isPending ? (ru ? "Проверяем…" : "Checking…") : (ru ? "Обновить" : "Refresh")}</Button>
        <ActionMenu label={`${ru ? "Действия источника" : "Source actions"} ${source.title}`} triggerClassName="inline-flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800" menuClassName="absolute right-0 top-9 z-40 w-64 rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-xl">
          <ActionMenuItem icon={<ShieldCheck size={14}/>} disabled={!enabled || mutation.isPending || !source.accountId} onClick={() => mutation.mutate("validate")}>{ru ? "Проверить доступ" : "Check access"}</ActionMenuItem>
          {connected && source.accessType !== "PUBLIC_CHANNEL" ? <ActionMenuItem disabled={!enabled || mutation.isPending} icon={source.monitoringState === "ACTIVE" ? <Pause size={14}/> : <Play size={14}/>} onClick={() => mutation.mutate("toggle")}>{source.monitoringState === "ACTIVE" ? (ru ? "Приостановить" : "Pause") : (ru ? "Продолжить мониторинг" : "Resume monitoring")}</ActionMenuItem> : null}
          <ActionMenuItem icon={<Settings2 size={14}/>} onClick={() => setSettings(true)}>{ru ? "Настройки подключения" : "Connection settings"}</ActionMenuItem>
        </ActionMenu>
      </> : null}</div></td></tr>
    {(mutation.isError || (mutation.data && !("id" in mutation.data)) || history) ? <tr><td colSpan={9} className="px-4 py-3">
    {mutation.isError ? <p role="alert" className="mt-2 text-xs text-amber-200">Не удалось обновить источник. Проверьте доступ аккаунта к каналу и повторите.</p> : null}
    {mutation.data && !("id" in mutation.data) ? <p role="status" className="mt-2 text-xs text-neutral-400">Проверено {mutation.data.received} · Новых или обновлённых {mutation.data.changed}</p> : null}
    {history ? <LeadHistoryPanel workspace={source.workspaceId} sourceId={source.id} enabled={enabled && connected} canManage={canManage} /> : null}
    </td></tr> : null}
    {settings ? <LeadSourceSettings source={source} onClose={() => setSettings(false)}/> : null}
  </Fragment>;
}
