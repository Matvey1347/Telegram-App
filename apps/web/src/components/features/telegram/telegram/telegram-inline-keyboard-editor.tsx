"use client";


import { GripVertical, Link2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { TelegramPostButtonRows, TelegramPostButtonStyle } from "@telegram-system/shared";
import { Button, Input, Modal } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

const styles: Array<{ value: TelegramPostButtonStyle; tone: string }> = [
  { value: "default", tone: "border-[#36546b] bg-[#203345] text-[#63b5ec]" },
  { value: "primary", tone: "border-[#3e91c4] bg-[#2b7eb6] text-white" },
  { value: "success", tone: "border-[#39986f] bg-[#277e5b] text-white" },
  { value: "danger", tone: "border-[#b85f66] bg-[#a94e56] text-white" },
];
const blankButton = () => ({ text: "", url: "", style: "default" as const });
const compactRows = (rows: TelegramPostButtonRows) => rows.map((row) => row.filter((button) => button.text.trim() && button.url.trim())).filter((row) => row.length > 0);

export function TelegramInlineKeyboardEditor({ buttonRows, onChange, disabled, open, onOpenChange, canPublishInlineButtons = true, onCheckPublishingAccess }: {
  buttonRows: TelegramPostButtonRows;
  onChange: (rows: TelegramPostButtonRows) => void;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canPublishInlineButtons?: boolean;
  onCheckPublishingAccess?: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [draggedRow, setDraggedRow] = useState<number | null>(null);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [draggedButton, setDraggedButton] = useState<{ row: number; button: number } | null>(null);
  const errors = useMemo(() => buttonRows.map((row) => row.map((button) => {
    if (!button.text.trim() && !button.url.trim()) return { text: "", link: "" };
    const textError = button.text.trim() ? "" : t("telegram.posts.editorComponents.inlineButtons.errors.textRequired");
    try {
      const url = new URL(button.url);
      return { text: textError, link: ["http:", "https:", "tg:"].includes(url.protocol) ? "" : t("telegram.posts.editorComponents.inlineButtons.errors.protocol") };
    } catch {
      return { text: textError, link: t("telegram.posts.editorComponents.inlineButtons.errors.invalidLink") };
    }
  })), [buttonRows, t]);
  const updateButton = (rowIndex: number, buttonIndex: number, patch: Partial<TelegramPostButtonRows[number][number]>) =>
    onChange(buttonRows.map((row, ri) => ri === rowIndex ? row.map((button, bi) => bi === buttonIndex ? { ...button, ...patch } : button) : row));
  const moveButton = (from: { row: number; button: number }, to: { row: number; button: number }) => {
    if (from.row !== to.row || from.button === to.button) return;
    const next = buttonRows.map((row) => [...row]);
    const row = next[from.row]!;
    const [button] = row.splice(from.button, 1);
    row.splice(to.button, 0, button!);
    onChange(next);
  };
  const moveRow = (from: number, to: number) => { if (from === to) return; const next = [...buttonRows]; const [row] = next.splice(from, 1); next.splice(to, 0, row!); onChange(next); };
  return <Modal open={open} onClose={() => onOpenChange(false)} title={t("telegram.posts.editorComponents.inlineButtons.title")} size="md">
    <div className="space-y-3">
      {!canPublishInlineButtons ? <div className="rounded-md border border-amber-700/60 bg-amber-950/30 p-3 text-xs text-amber-100"><p className="font-medium">{t("telegram.posts.editorComponents.inlineButtons.accessRequired")}</p><p className="mt-1 text-amber-200/80">{t("telegram.posts.editorComponents.inlineButtons.accessHelp")}</p><Button type="button" className="mt-3" disabled={disabled || checkingAccess || !onCheckPublishingAccess} onClick={async () => { if (!onCheckPublishingAccess) return; setCheckingAccess(true); try { await onCheckPublishingAccess(); } finally { setCheckingAccess(false); } }}>{checkingAccess ? t("telegram.posts.editorComponents.inlineButtons.checkingAccess") : t("telegram.posts.editorComponents.inlineButtons.checkAccess")}</Button></div> : null}
      {canPublishInlineButtons ? <><p className="text-xs text-neutral-400">{t("telegram.posts.editorComponents.inlineButtons.description")}</p>
      {buttonRows.map((row, rowIndex) => <div className={`rounded-md border bg-neutral-900/40 p-2.5 ${draggedRow === rowIndex ? "border-sky-500/70 opacity-60" : "border-neutral-800"}`} key={`row-${rowIndex}`} onDragOver={(event) => { if (draggedRow == null) return; event.preventDefault(); }} onDrop={() => { if (draggedRow != null) moveRow(draggedRow, rowIndex); setDraggedRow(null); }}>
        <div className="mb-2 flex items-center justify-between"><span className="flex items-center gap-1 text-xs font-medium text-neutral-300">{buttonRows.length > 1 ? <span draggable={!disabled} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedRow(rowIndex); }} onDragEnd={() => setDraggedRow(null)} className="cursor-grab text-neutral-500 active:cursor-grabbing"><GripVertical size={15} /></span> : null}{t("telegram.posts.editorComponents.inlineButtons.row", { number: rowIndex + 1 })}</span><IconButton label={t("telegram.posts.editorComponents.inlineButtons.deleteRow")} icon={Trash2} disabled={disabled} onClick={() => onChange(buttonRows.filter((_, index) => index !== rowIndex))} /></div>
        <div className="space-y-2">{row.map((button, buttonIndex) => <div className={`grid gap-2 ${row.length > 1 ? "sm:grid-cols-[18px_minmax(0,.9fr)_minmax(0,1.2fr)_112px_auto]" : "sm:grid-cols-[minmax(0,.9fr)_minmax(0,1.2fr)_112px_auto]"} ${draggedButton?.row === rowIndex && draggedButton.button === buttonIndex ? "opacity-60" : ""}`} key={`button-${buttonIndex}`} onDragOver={(event) => { if (!draggedButton || draggedButton.row !== rowIndex) return; event.preventDefault(); }} onDrop={() => { if (draggedButton) moveButton(draggedButton, { row: rowIndex, button: buttonIndex }); setDraggedButton(null); }}>
          {row.length > 1 ? <span draggable={!disabled} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedButton({ row: rowIndex, button: buttonIndex }); }} onDragEnd={() => setDraggedButton(null)} className="mt-7 cursor-grab text-neutral-500 active:cursor-grabbing"><GripVertical size={15} /></span> : null}
          <Field label={t("telegram.posts.editorComponents.inlineButtons.text")} error={errors[rowIndex]?.[buttonIndex]?.text ?? ""}><Input value={button.text} disabled={disabled} onChange={(event) => updateButton(rowIndex, buttonIndex, { text: event.target.value })} /></Field>
          <Field label={t("telegram.posts.editorComponents.inlineButtons.link")} error={errors[rowIndex]?.[buttonIndex]?.link ?? ""}><Input value={button.url} disabled={disabled} onChange={(event) => updateButton(rowIndex, buttonIndex, { url: event.target.value })} placeholder="https://example.com" /></Field>
          <StylePicker value={button.style} disabled={disabled} onChange={(style) => updateButton(rowIndex, buttonIndex, { style })} />
          <div className="flex items-end"><IconButton label={t("telegram.posts.editorComponents.inlineButtons.deleteButton")} icon={Trash2} disabled={disabled} onClick={() => onChange(buttonRows.map((currentRow, index) => index === rowIndex ? currentRow.filter((_, currentButton) => currentButton !== buttonIndex) : currentRow))} /></div>
        </div>)}</div>
        <button type="button" disabled={disabled || !canPublishInlineButtons} onClick={() => onChange(buttonRows.map((currentRow, index) => index === rowIndex ? [...currentRow, blankButton()] : currentRow))} className="mt-2 inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 disabled:opacity-50"><Plus size={14} /> {t("telegram.posts.editorComponents.inlineButtons.button")}</button>
      </div>)}
      <div className="flex items-center justify-between"><button type="button" disabled={disabled} onClick={() => onChange([...buttonRows, [blankButton()]])} className="inline-flex items-center gap-1 text-sm text-sky-400 hover:text-sky-300 disabled:opacity-50"><Plus size={15} /> {t("telegram.posts.editorComponents.inlineButtons.addRow")}</button><Button type="button" disabled={disabled} onClick={() => { if (errors.flat().some((error) => error.text || error.link)) return; onChange(compactRows(buttonRows)); onOpenChange(false); }}>{t("telegram.posts.editorComponents.inlineButtons.done")}</Button></div></> : null}
    </div>
  </Modal>;
}

export function TelegramInlineKeyboardSummary({ rows, onEdit, disabled }: { rows: TelegramPostButtonRows; onEdit: () => void; disabled?: boolean }) {
  const { t } = useI18n();
  if (!rows.length) return null;
  return <button type="button" disabled={disabled} onClick={onEdit} className="flex w-full items-center gap-2 border-t border-neutral-800 px-3 py-2 text-left text-xs text-neutral-400 hover:bg-neutral-900/70 disabled:opacity-50"><Link2 size={14} className="text-sky-400" /><span className="shrink-0">{t("telegram.posts.editorComponents.inlineButtons.title")}</span><span className="min-w-0 truncate text-neutral-300">{rows.flat().map((button) => button.text || t("telegram.posts.editorComponents.inlineButtons.untitled")).join(" · ")}</span><span className="ml-auto text-sky-400">{t("telegram.posts.editorComponents.inlineButtons.edit")}</span></button>;
}
function Field({ label, error, children }: { label: string; error: string; children: React.ReactNode }) { return <label className="min-w-0 text-xs font-medium text-neutral-300">{label}{children}{error ? <span className="mt-0.5 block text-[11px] font-normal text-rose-400">{error}</span> : null}</label>; }
function IconButton({ label, icon: Icon, onClick, disabled }: { label: string; icon: typeof Trash2; onClick: () => void; disabled?: boolean }) { return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="inline-flex h-7 w-7 items-center justify-center rounded text-rose-400 hover:bg-rose-950/50 hover:text-rose-300 disabled:opacity-40"><Icon size={15} /></button>; }
function StylePicker({ value, onChange, disabled }: { value: TelegramPostButtonStyle; onChange: (value: TelegramPostButtonStyle) => void; disabled?: boolean }) { const { t } = useI18n(); const [open, setOpen] = useState(false); const current = styles.find((style) => style.value === value)!; const styleLabel = (style: TelegramPostButtonStyle) => ({ default: t("telegram.posts.editorComponents.inlineButtons.styles.default"), primary: t("telegram.posts.editorComponents.inlineButtons.styles.primary"), success: t("telegram.posts.editorComponents.inlineButtons.styles.success"), danger: t("telegram.posts.editorComponents.inlineButtons.styles.danger") })[style]; return <div className="relative min-w-0 text-xs font-medium text-neutral-300"><span>{t("telegram.posts.editorComponents.inlineButtons.style")}</span><button type="button" disabled={disabled} onClick={() => setOpen((currentOpen) => !currentOpen)} className={`mt-1 flex h-9 w-full items-center justify-between rounded-md border px-2 text-left ${current.tone}`}><span>{styleLabel(current.value)}</span><span className="text-white/80">⌄</span></button>{open ? <div className="absolute z-20 mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 p-1 shadow-xl">{styles.map((style) => <button key={style.value} type="button" onClick={() => { onChange(style.value); setOpen(false); }} className={`mb-1 flex w-full items-center rounded px-2 py-1.5 text-left last:mb-0 ${style.tone}`}><span className="h-2 w-2 rounded-full bg-current opacity-80" /><span className="ml-2">{styleLabel(style.value)}</span>{style.value === value ? <span className="ml-auto">✓</span> : null}</button>)}</div> : null}</div>; }
