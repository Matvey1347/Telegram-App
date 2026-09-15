"use client";

import { useState } from "react";
import { Brain, CalendarDays, FileText, Layers3 } from "lucide-react";
import type { TelegramUnifiedImportManifest, TelegramUnifiedImportPreview as PreviewResult, TelegramUnifiedImportPreviewSection } from "@telegram-system/shared";
import { useI18n } from "@/providers/i18n-provider";
import { UnifiedImportPostsPreview } from "./unified-import-posts-preview";
import { ActionBadge, UnifiedImportGroupsPreview, UnifiedImportHypothesesPreview } from "./unified-import-entities-preview";
import { UnifiedImportCalendarPreview } from "./unified-import-calendar-preview";
import { UnifiedImportDeletePreview } from "./unified-import-delete-preview";

type SectionKey = TelegramUnifiedImportPreviewSection["key"];

export function UnifiedImportPreview({ preview, manifest, channelId, channelTitle, channelPhotoUrl, channelTelegramChatId, captionLengthMax = 1024, messageLengthMax = 4096, disabled, onChange }: {
  preview: PreviewResult;
  manifest: TelegramUnifiedImportManifest;
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  channelTelegramChatId?: string | null;
  captionLengthMax?: number;
  messageLengthMax?: number;
  disabled: boolean;
  onChange: (manifest: TelegramUnifiedImportManifest) => void;
}) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<SectionKey>("posts");
  const [operationBySection, setOperationBySection] = useState<
    Partial<Record<SectionKey, "create" | "delete">>
  >({});
  const definitions = [
    { key: "posts" as const, label: t("telegram.posts.tabs.posts"), icon: FileText },
    { key: "groups" as const, label: t("telegram.posts.tabs.groups"), icon: Layers3 },
    { key: "hypotheses" as const, label: t("telegram.posts.hypotheses"), icon: Brain },
    { key: "schedule" as const, label: t("telegram.posts.tabs.calendar"), icon: CalendarDays },
  ];
  const sections = definitions.flatMap((definition) => {
    const section = preview.sections.find((candidate) => candidate.key === definition.key);
    return section?.items.length ? [{ ...definition, section }] : [];
  });
  if (!sections.length) return null;
  const selected = sections.find((entry) => entry.key === activeSection) ?? sections[0];
  const createItems = selected.section.items.filter((item) => item.action !== "DELETE");
  const deleteItems = selected.section.items.filter((item) => item.action === "DELETE");
  const operation = operationBySection[selected.key] ?? (createItems.length ? "create" : "delete");
  const hasOperationTabs = selected.key !== "schedule" && createItems.length > 0 && deleteItems.length > 0;
  const extraItems = selected.section.items.filter((item) => {
    return selected.key !== "schedule" && operation === "create" && item.action !== "DELETE" && item.errors.length > 0;
  });

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/60">
      <div role="tablist" aria-label={t("telegram.posts.import.preview")} className="flex min-w-0 gap-1 overflow-x-auto border-b border-neutral-800 p-1">
        {sections.map((entry) => {
          const Icon = entry.icon;
          const active = entry.key === selected.key;
          return (
            <button key={entry.key} type="button" role="tab" aria-selected={active} onClick={() => setActiveSection(entry.key)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-blue-600 text-white" : "text-neutral-400 hover:bg-neutral-900 hover:text-white"}`}>
              <Icon size={15} aria-hidden="true" /> {entry.label}
              <span className="rounded bg-black/20 px-1.5 py-0.5 text-[11px] tabular-nums">{entry.section.items.length}</span>
            </button>
          );
        })}
      </div>
      <div className="p-3">
        {hasOperationTabs ? (
          <div role="tablist" aria-label={t("telegram.posts.import.operationTabs")} className="mb-3 grid grid-cols-2 gap-1 rounded-lg border border-neutral-800 bg-neutral-900/70 p-1 text-xs">
            {(["create", "delete"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={operation === tab}
                onClick={() => setOperationBySection((current) => ({ ...current, [selected.key]: tab }))}
                className={`rounded-md px-2 py-2 font-medium transition ${operation === tab ? tab === "delete" ? "bg-rose-700 text-white" : "bg-emerald-700 text-white" : "text-neutral-400 hover:bg-neutral-800 hover:text-white"}`}
              >
                {tab === "create"
                  ? t("telegram.posts.import.createTab", { count: createItems.length })
                  : t("telegram.posts.import.deleteTab", { count: deleteItems.length })}
              </button>
            ))}
          </div>
        ) : null}
        {operation === "create" && selected.key === "posts" ? <UnifiedImportPostsPreview manifest={manifest} channelId={channelId} channelTitle={channelTitle} channelPhotoUrl={channelPhotoUrl} channelTelegramChatId={channelTelegramChatId} captionLengthMax={captionLengthMax} messageLengthMax={messageLengthMax} disabled={disabled} onChange={onChange} /> : null}
        {operation === "create" && selected.key === "groups" ? <UnifiedImportGroupsPreview manifest={manifest} disabled={disabled} onChange={onChange} /> : null}
        {operation === "create" && selected.key === "hypotheses" ? <UnifiedImportHypothesesPreview manifest={manifest} disabled={disabled} onChange={onChange} /> : null}
        {selected.key !== "schedule" && operation === "delete" ? (
          <UnifiedImportDeletePreview
            section={selected.key as "posts" | "groups" | "hypotheses"}
            items={deleteItems}
            channelId={channelId}
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
          />
        ) : null}
        {selected.key === "schedule" ? <UnifiedImportCalendarPreview manifest={manifest} previewItems={selected.section.items} channelId={channelId} channelTitle={channelTitle} channelPhotoUrl={channelPhotoUrl} disabled={disabled} onChange={onChange} /> : null}
        {extraItems.length ? <div className="mt-3 space-y-2">{extraItems.map((item) => <div key={`${item.ref}:${item.action}`} className={`rounded-lg border px-3 py-2 text-sm ${item.errors.length ? "border-rose-900/70 bg-rose-950/20 text-rose-200" : "border-neutral-800 bg-neutral-900 text-neutral-200"}`}><ActionBadge action={item.action} /><span className="ml-2">{item.label}</span>{item.errors.length ? <p className="mt-1 text-xs">{item.errors.join("; ")}</p> : null}</div>)}</div> : null}
      </div>
    </section>
  );
}
