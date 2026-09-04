"use client";


import { Braces, ChevronDown, Heading, Link as LinkIcon, MousePointerClick, Quote, Settings2, Sigma, SmilePlus, Table2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { EditorCommandId } from "@telegram-system/shared";
import { editorWrapActions } from "./telegram-text-editor-commands";
import { useI18n } from "@/providers/i18n-provider";

export function TelegramTextEditorToolbar({ disabled, hasButtons, onCommand, onHeading, onPullQuoteWithAuthor, onConfigure }: {
  disabled?: boolean;
  hasButtons: boolean;
  onCommand: (command: EditorCommandId) => void;
  onHeading: (level: number) => void;
  onPullQuoteWithAuthor: () => void;
  onConfigure: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<"heading" | "quote" | null>(null);
  const select = (action: () => void) => { action(); setOpen(null); };
  const wrapLabels: Partial<Record<EditorCommandId, string>> = {
    bold: t("telegram.posts.editorComponents.format.bold"),
    italic: t("telegram.posts.editorComponents.format.italic"),
    underline: t("telegram.posts.editorComponents.format.underline"),
    strikethrough: t("telegram.posts.editorComponents.format.strikethrough"),
    spoiler: t("telegram.posts.editorComponents.format.spoiler"),
    inlineCode: t("telegram.posts.editorComponents.format.inlineCode"),
  };
  return <div className="flex flex-wrap items-center gap-1 border-b border-neutral-700 bg-neutral-950/70 p-2">
    {editorWrapActions.map(({ id, icon }) => <ToolbarButton key={id} label={wrapLabels[id]!} icon={icon} disabled={disabled} onClick={() => onCommand(id)} />)}
    <span className="mx-1 h-6 w-px bg-neutral-700" />
    <ToolbarButton label={t("telegram.posts.editorComponents.format.codeBlock")} icon={Braces} disabled={disabled} onClick={() => onCommand("codeBlock")} />
    <ToolbarMenu label={t("telegram.posts.editorComponents.format.quote")} icon={Quote} open={open === "quote"} disabled={disabled} onToggle={() => setOpen(open === "quote" ? null : "quote")}>
      <MenuItem icon={Quote} label={t("telegram.posts.editorComponents.format.quote")} onClick={() => select(() => onCommand("quote"))} />
      <MenuItem icon={Quote} label={t("telegram.posts.editorComponents.format.pullQuote")} onClick={() => select(() => onCommand("pullQuote"))} />
      <MenuItem icon={Quote} label={t("telegram.posts.editorComponents.format.pullQuoteWithAuthor")} onClick={() => select(onPullQuoteWithAuthor)} />
    </ToolbarMenu>
    <ToolbarMenu label={t("telegram.posts.editorComponents.format.heading")} icon={Heading} open={open === "heading"} disabled={disabled} onToggle={() => setOpen(open === "heading" ? null : "heading")}>
      {[1, 2, 3, 4, 5, 6].map((level) => <MenuItem key={level} icon={Heading} label={t("telegram.posts.editorComponents.format.headingLevel", { level })} onClick={() => select(() => onHeading(level))} />)}
    </ToolbarMenu>
    <ToolbarButton label={t("telegram.posts.editorComponents.format.table")} icon={Table2} disabled={disabled} onClick={() => onCommand("table")} />
    <ToolbarButton label={t("telegram.posts.editorComponents.format.formula")} icon={Sigma} disabled={disabled} onClick={() => onCommand("formula")} />
    <span className="mx-1 h-6 w-px bg-neutral-700" />
    <ToolbarButton label={t("telegram.posts.editorComponents.format.insertLink")} icon={LinkIcon} disabled={disabled} onClick={() => onCommand("link")} />
    <ToolbarButton label={t("telegram.posts.editorComponents.format.emoji")} icon={SmilePlus} disabled={disabled} onClick={() => onCommand("emoji")} />
    {hasButtons ? <ToolbarButton label={t("telegram.posts.editorComponents.inlineButtons.title")} icon={MousePointerClick} disabled={disabled} onClick={() => onCommand("buttons")} /> : null}
    <ToolbarButton label={t("telegram.posts.editorComponents.shortcuts.configure")} icon={Settings2} disabled={disabled} onClick={onConfigure} />
  </div>;
}

function ToolbarButton({ label, icon: Icon, onClick, disabled }: { label: string; icon: LucideIcon; onClick: () => void; disabled?: boolean }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:opacity-40"><Icon size={17} /></button>;
}

function ToolbarMenu({ label, icon, open, disabled, onToggle, children }: { label: string; icon: LucideIcon; open: boolean; disabled?: boolean; onToggle: () => void; children: React.ReactNode }) {
  const Icon = icon;
  return <div className="relative"><button type="button" title={label} aria-label={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onToggle} className="inline-flex h-8 items-center gap-0.5 rounded-md px-1.5 text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-40"><Icon size={17} /><ChevronDown size={13} /></button>{open ? <div className="absolute left-0 top-9 z-40 min-w-48 rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl">{children}</div> : null}</div>;
}

function MenuItem({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"><Icon size={16} /><span>{label}</span></button>;
}
