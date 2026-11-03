"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BellRing, Plus, UsersRound } from "lucide-react";
import { Button, ConfirmDeleteModal, Input, Modal, Select } from "@/components/ui/primitives";
import type { ResolvedEmoji } from "@telegram-system/shared";
import type { TelegramChannelSelectOption } from "@/lib/api-types/telegram/telegram-channels";
import { IconPicker } from "@/components/icons/icon-picker";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramChannelAvatarList } from "./telegram-channel-avatar-list";
import { TemplateCardActions } from "./template-card-actions";
import { telegramChannelsApi, workspaceMembersApi } from "@/lib/api";
import { channelReminderKeys, memberKeys, telegramChannelKeys } from "@/lib/query-keys";
import { channelRemindersApi, type ChannelReminderTemplate, type ChannelReminderTemplateInput } from "@/lib/features/telegram/channel-reminders-api";
import { useChannelReminderCopy } from "./use-channel-reminder-copy";
import { useAppToast } from "@/providers/toast-provider";

const blank = (): ChannelReminderTemplateInput => ({ name: "", daysBefore: [3, 2, 1], notifyEmpty: true });
type ChannelDraft = { templateId: string; memberId: string };
function channelAvatar(channel: TelegramChannelSelectOption): ResolvedEmoji | null {
  if (channel.avatarPresentation) return channel.avatarPresentation;
  if (channel.photoUrl) {
    return {
      type: "image",
      id: channel.id,
      url: channel.photoUrl,
      name: channel.title,
    };
  }
  return channel.presentationIconPresentation ?? null;
}

function apiErrorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(message) ? message.join(" · ") : message || fallback;
}

export function ChannelReminderModal({ onClose }: { onClose: () => void }) {
  const t = useChannelReminderCopy();
  const client = useQueryClient();
  const { pushToast } = useAppToast();
  const [view, setView] = useState<"list" | "editor" | "assignments">("list");
  const [draft, setDraft] = useState<ChannelReminderTemplateInput>(blank);
  const [iconPending, setIconPending] = useState(false);
  const [draftIcon, setDraftIcon] = useState<ResolvedEmoji | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChannelReminderTemplate | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [channelDrafts, setChannelDrafts] = useState<Record<string, ChannelDraft>>({});
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const settings = useQuery({ queryKey: channelReminderKeys.settings(), queryFn: channelRemindersApi.list });
  const channels = useQuery({ queryKey: telegramChannelKeys.select({ owned: true }), queryFn: () => telegramChannelsApi.select({ owned: true }) });
  const members = useQuery({ queryKey: memberKeys.membersSelect(), queryFn: () => workspaceMembersApi.select() });
  const assignmentByChannel = new Map(settings.data?.assignments.map((item) => [item.channelId, item]));
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: channelReminderKeys.settings() }),
      client.invalidateQueries({ queryKey: telegramChannelKeys.lists() }),
      client.invalidateQueries({ queryKey: telegramChannelKeys.details() }),
    ]);
  };
  const save = useMutation({
    mutationFn: () => editing ? channelRemindersApi.update(editing, draft) : channelRemindersApi.create(draft),
    onSuccess: async () => { setDraft(blank()); setEditing(null); setView("list"); await refresh(); pushToast(t("channelReminders.saved"), "success"); },
    onError: (error) => pushToast(`${t("channelReminders.saveError")}: ${apiErrorMessage(error, "")}`.replace(/: $/, ""), "error"),
  });
  const remove = useMutation({
    mutationFn: channelRemindersApi.remove,
    onSuccess: async () => { setDeleteTarget(null); setEditing(null); setDraft(blank()); await refresh(); pushToast(t("channelReminders.deleted"), "success"); },
    onError: () => pushToast(t("channelReminders.deleteError"), "error"),
  });
  const assign = useMutation({
    mutationFn: () => channelRemindersApi.assign({ items: selected.map((channelId) => { const draft = channelDrafts[channelId]; const assignment = assignmentByChannel.get(channelId); return { channelId, templateId: draft ? draft.templateId || null : assignment?.templateId ?? null, memberId: draft ? draft.memberId || null : assignment?.memberId ?? null }; }) }),
    onSuccess: async () => { setSelected([]); setView("list"); await refresh(); pushToast(t("channelReminders.updated"), "success"); },
    onError: () => pushToast(t("channelReminders.updateError"), "error"),
  });
  const channelRows = channels.data ?? [];
  const allSelected = channelRows.length > 0 && channelRows.every((channel) => selected.includes(channel.id));
  const assignedChannels = (templateId: string) => channelRows.filter((channel) => assignmentByChannel.get(channel.id)?.templateId === templateId);
  const checkboxClass = "h-4 w-4 shrink-0 appearance-none rounded border border-neutral-600 bg-neutral-950 checked:border-blue-500 checked:bg-blue-600 checked:after:block checked:after:text-center checked:after:text-xs checked:after:leading-3 checked:after:text-white checked:after:content-['✓'] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
  return <>
    <Modal open onClose={onClose} title={t("channelReminders.title")} titleIcon={<BellRing size={19} aria-hidden />} size="xl" leadingHeaderAction={view !== "list" ? <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-700 text-white hover:bg-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500" aria-label={t("channelReminders.back")} title={t("channelReminders.back")} onClick={() => { setView("list"); setEditing(null); setDraft(blank()); }}><ArrowLeft size={24} strokeWidth={2.5} aria-hidden="true" /></button> : undefined}>
      {view === "list" && <section className="space-y-3" aria-label={t("channelReminders.templates")}>
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold text-neutral-100">{t("channelReminders.templates")}</h3><div className="flex gap-2"><Button variant="secondary" onClick={() => { setSelected([]); setChannelDrafts({}); setBulkTemplateId(""); setView("assignments"); }}><UsersRound size={16} /> {t("channelReminders.manageChannels")}</Button><Button onClick={() => { setEditing(null); setDraft(blank()); setDraftIcon(null); setView("editor"); }}><Plus size={16} /> {t("channelReminders.new")}</Button></div></div>
        {settings.isLoading ? <p role="status">{t("channelReminders.loading")}</p> : settings.isError ? <p role="alert" className="text-rose-300">{t("channelReminders.loadError")} <button className="underline" onClick={() => void settings.refetch()}>{t("channelReminders.retry")}</button></p> : null}
        {!settings.isLoading && !settings.isError && !settings.data?.templates.length && <p className="text-sm text-neutral-400">{t("channelReminders.emptyTemplates")}</p>}
        {view === "list" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{settings.data?.templates.map((item) => {
          const used = assignedChannels(item.id);
          const assignmentCount = settings.data?.assignments.filter((assignment) => assignment.templateId === item.id).length ?? 0;
          return <div key={item.id} className="space-y-2 rounded-lg border border-neutral-800 p-3">
          <div className="flex items-start gap-2"><IconAvatar icon={item.iconPresentation} label={item.name} size="sm" decorative /><div className="min-w-0 flex-1"><p className="truncate font-medium">{item.name}</p><p className="text-xs text-neutral-400">{t("channelReminders.channelCount", { count: assignmentCount })} · {t("channelReminders.ruleCount", { count: item.daysBefore.length + Number(item.notifyEmpty) })}</p></div><TemplateCardActions editLabel={t("channelReminders.edit", { name: item.name })} deleteLabel={t("channelReminders.delete", { name: item.name })} onEdit={() => { setEditing(item.id); setDraft({ name: item.name, iconId: item.iconId, daysBefore: item.daysBefore, notifyEmpty: item.notifyEmpty }); setDraftIcon(item.iconPresentation); setView("editor"); }} onDelete={() => setDeleteTarget(item)} /></div>
          {used.length ? <div className="space-y-2">{[...new Set(used.map((channel) => assignmentByChannel.get(channel.id)?.memberId ?? ""))].map((ownerId) => { const owner = members.data?.find((member) => member.id === ownerId); const group = used.filter((channel) => (assignmentByChannel.get(channel.id)?.memberId ?? "") === ownerId); const ownerName = owner?.user.name ?? t("channelReminders.unassigned"); return <div key={ownerId || "unassigned"} className="flex items-center gap-2"><IconAvatar icon={owner?.avatarPresentation} label={ownerName} size="xs" decorative /><span className="text-xs font-medium text-neutral-300">{ownerName}</span><TelegramChannelAvatarList channels={group} ariaLabel={t("channelReminders.showChannels", { name: ownerName, count: group.length })} maxVisible={group.length} countLabel={t("channelReminders.channelCount", { count: group.length })} /></div>; })}</div> : <p className="text-xs text-neutral-500">{t("channelReminders.noAssignedChannels")}</p>}
          <p className="text-xs text-neutral-400">{item.daysBefore.length ? t("channelReminders.before", { days: item.daysBefore.join(", ") }) : t("channelReminders.noAdvance")}{item.notifyEmpty ? t("channelReminders.emptyDays") : ""}</p>
        </div>;
        })}</div>}
      </section>}
      {view === "editor" && <section className="space-y-4" aria-label={t(editing ? "channelReminders.editTitle" : "channelReminders.new")}>
          <div className="flex items-end gap-3"><div><span className="block text-sm">{t("channelReminders.icon")}</span><IconPicker compact iconId={draft.iconId} icon={draftIcon} onPendingChange={setIconPending} onChange={(iconId, icon) => { setDraft({ ...draft, iconId }); setDraftIcon(icon ?? null); }} buttonLabel={t("channelReminders.addIcon")} /></div><label className="block flex-1 text-sm">{t("channelReminders.name")}<Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label></div>
          <fieldset><legend className="text-sm">{t("channelReminders.threshold")}</legend><div className="mt-2 flex flex-wrap gap-4">{[3, 2, 1].map((day) => <label key={day} className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkboxClass} checked={draft.daysBefore.includes(day)} onChange={(event) => setDraft({ ...draft, daysBefore: event.target.checked ? [...draft.daysBefore, day].sort((a,b) => b-a) : draft.daysBefore.filter((value) => value !== day) })} />{t(day === 1 ? "channelReminders.day1" : day === 2 ? "channelReminders.day2" : "channelReminders.day3")}</label>)}</div></fieldset>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkboxClass} checked={draft.notifyEmpty} onChange={(event) => setDraft({ ...draft, notifyEmpty: event.target.checked })} /> {t("channelReminders.emptyToday")}</label>
          <div className="flex gap-2"><Button disabled={save.isPending || iconPending || !draft.name.trim() || (!draft.daysBefore.length && !draft.notifyEmpty)} onClick={() => save.mutate()}>{t(editing ? "channelReminders.save" : "channelReminders.create")}</Button></div>
      </section>}
      {view === "assignments" && <section className="mt-6 space-y-3 border-t border-neutral-800 pt-4" aria-label={t("channelReminders.assignments")}>
        <h3 className="font-semibold">{t("channelReminders.assignments")}</h3>
        {channels.isLoading || members.isLoading ? <p role="status">{t("channelReminders.loadingChannels")}</p> : channels.isError || members.isError ? <p role="alert" className="text-rose-300">{t("channelReminders.channelsError")} <button className="underline" onClick={() => { void channels.refetch(); void members.refetch(); }}>{t("channelReminders.retry")}</button></p> : !channelRows.length ? <p className="text-sm text-neutral-400">{t("channelReminders.noChannels")}</p> : <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className={checkboxClass} checked={allSelected} onChange={(event) => setSelected(event.target.checked ? channelRows.map((channel) => channel.id) : [])} /> {t("channelReminders.all")}</label>
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-3"><label className="min-w-56 flex-1 text-sm">{t("channelReminders.template")}<Select value={bulkTemplateId} onChange={(event) => setBulkTemplateId(event.target.value)}><option value="">{t("channelReminders.noTemplate")}</option>{settings.data?.templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label><Button type="button" variant="secondary" disabled={!selected.length} onClick={() => setChannelDrafts((current) => Object.fromEntries([...new Set([...Object.keys(current), ...selected])].map((id) => { const assignment = assignmentByChannel.get(id); const row = current[id] ?? { templateId: assignment?.templateId ?? "", memberId: assignment?.memberId ?? "" }; return [id, { ...row, templateId: bulkTemplateId }]; })))}>{t("channelReminders.applyTemplateToSelected", { count: selected.length })}</Button></div>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">{channelRows.map((channel) => { const assignment = assignmentByChannel.get(channel.id); const row = channelDrafts[channel.id] ?? { templateId: assignment?.templateId ?? "", memberId: assignment?.memberId ?? "" }; return <div key={channel.id} className="grid gap-3 rounded-lg border border-neutral-800 p-3 md:grid-cols-[minmax(220px,1fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)] md:items-center"><label className="flex min-w-0 items-center gap-2 text-sm"><input type="checkbox" aria-label={channel.title} className={checkboxClass} checked={selected.includes(channel.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, channel.id] : selected.filter((id) => id !== channel.id))} /><IconAvatar icon={channelAvatar(channel)} label={channel.title} size="sm" decorative bordered={false} className="rounded-full" /></label><label className="text-xs text-neutral-400">{t("channelReminders.template")}<Select value={row.templateId} onChange={(event) => setChannelDrafts((current) => ({ ...current, [channel.id]: { ...row, templateId: event.target.value } }))}><option value="">{t("channelReminders.noTemplate")}</option>{settings.data?.templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label><label className="text-xs text-neutral-400">{t("channelReminders.assignedMember")}<Select value={row.memberId} onChange={(event) => setChannelDrafts((current) => ({ ...current, [channel.id]: { ...row, memberId: event.target.value } }))}><option value="">{t("channelReminders.unassigned")}</option>{members.data?.map((member) => <option key={member.id} value={member.id} data-icon-url={member.avatarPresentation?.type === "image" ? member.avatarPresentation.url : undefined} data-icon-emoji={member.avatarPresentation?.type === "unicode" ? member.avatarPresentation.value : undefined} data-icon-fallback={member.user.name}>{member.user.name}</option>)}</Select></label></div>; })}</div>
          <Button disabled={!selected.length || assign.isPending || settings.isError} onClick={() => assign.mutate()}>{t("channelReminders.apply", { count: selected.length })}</Button>
        </>}
      </section>}
    </Modal>
    <ConfirmDeleteModal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} entityName={deleteTarget?.name ?? "template"} description={t("channelReminders.confirm")} onConfirm={() => deleteTarget ? remove.mutateAsync(deleteTarget.id) : undefined} />
  </>;
}
