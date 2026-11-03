"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Italic, Underline, Strikethrough, EyeOff, Code, Quote, Smile, Type, ChevronsUpDown, FileCode2 } from "lucide-react";
import { CrmEmojiPanel } from "./crm-emoji-panel";
import { renderCrmDraft, serializeCrmDraft } from "./crm-rich-text";

function Action({ label, children, disabled, onClick }: { label: string; children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-neutral-300 hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50">{children}</button>;
}

export function CrmCompactEditor({ value, onChange, disabled, onExpand, leading, trailing }: { value: string; onChange: (value: string) => void; disabled?: boolean; onExpand: () => void; leading?: ReactNode; trailing?: ReactNode }) {
  const editor = useRef<HTMLDivElement>(null);
  const selection = useRef<Range | null>(null);
  const lastEmitted = useRef<string | null>(null);
  const composing = useRef(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  useLayoutEffect(() => {
    if (!editor.current || composing.current || lastEmitted.current === value) return;
    renderCrmDraft(editor.current, value);
    lastEmitted.current = value;
    selection.current = null;
  }, [value]);
  const remember = () => {
    const range = window.getSelection();
    if (range?.rangeCount && editor.current?.contains(range.anchorNode) && editor.current.contains(range.focusNode)) selection.current = range.getRangeAt(0).cloneRange();
  };
  const commit = () => {
    if (!editor.current) return;
    const next = serializeCrmDraft(editor.current);
    lastEmitted.current = next;
    onChange(next);
    remember();
  };
  const restore = () => {
    const current = window.getSelection();
    if (!current || !selection.current || !editor.current?.contains(selection.current.commonAncestorContainer)) return false;
    current.removeAllRanges(); current.addRange(selection.current); return true;
  };
  const format = (kind: "bold" | "italic" | "underline" | "strike" | "spoiler" | "code" | "codeBlock" | "quote") => {
    if (!restore() || !selection.current || selection.current.collapsed) return;
    const range = selection.current;
    const tag = ({ bold: "STRONG", italic: "EM", underline: "U", strike: "S", spoiler: "SPAN", code: "CODE", codeBlock: "SPAN", quote: "SPAN" } as const)[kind];
    const container = range.commonAncestorContainer instanceof HTMLElement ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    const existing = container?.closest(kind === "quote" ? '[data-quote="true"]' : kind === "codeBlock" ? '[data-code-block]' : kind === "spoiler" ? '[data-marker="||"]' : tag.toLowerCase());
    if (existing && editor.current?.contains(existing) && range.toString() === existing.textContent) {
      const replacement = document.createDocumentFragment();
      while (existing.firstChild) replacement.appendChild(existing.firstChild);
      const first = replacement.firstChild, last = replacement.lastChild;
      existing.replaceWith(replacement);
      if (first && last) { range.setStartBefore(first); range.setEndAfter(last); selection.current = range.cloneRange(); }
      editor.current.focus(); restore(); commit(); return;
    }
    const wrapper = document.createElement(tag.toLowerCase());
    if (kind === "codeBlock") { wrapper.dataset.codeBlock = ""; wrapper.className = "my-1 block rounded-md bg-neutral-950 px-2 py-1 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]"; }
    if (kind === "spoiler") { wrapper.dataset.marker = "||"; wrapper.className = "rounded bg-neutral-600 px-0.5"; }
    if (kind === "quote") { wrapper.dataset.quote = "true"; wrapper.className = "border-l-2 border-blue-400 pl-2"; }
    const preceding = range.cloneRange();
    preceding.selectNodeContents(editor.current!); preceding.setEnd(range.startContainer, range.startOffset);
    const following = range.cloneRange();
    following.selectNodeContents(editor.current!); following.setStart(range.endContainer, range.endOffset);
    const needsBefore = kind === "quote" && preceding.toString().length > 0 && !preceding.toString().endsWith("\n");
    const needsAfter = kind === "quote" && following.toString().length > 0 && !following.toString().startsWith("\n");
    wrapper.appendChild(range.extractContents()); range.insertNode(wrapper);
    if (needsBefore) wrapper.before(document.createTextNode("\n"));
    if (needsAfter) wrapper.after(document.createTextNode("\n"));
    range.selectNodeContents(wrapper); selection.current = range.cloneRange();
    editor.current?.focus(); restore(); commit();
  };
  const insert = (markup: string) => {
    if (!editor.current) return;
    if (!restore()) { const range = document.createRange(); range.selectNodeContents(editor.current); range.collapse(false); selection.current = range; restore(); }
    const range = selection.current!;
    range.deleteContents();
    const fragment = document.createElement("span"); renderCrmDraft(fragment, markup);
    const nodes = [...fragment.childNodes];
    for (const node of nodes) { range.insertNode(node); range.setStartAfter(node); }
    range.collapse(true); selection.current = range.cloneRange();
    commit();
  };
  return <div>
    {formatOpen ? <div role="toolbar" aria-label="Message formatting" className="mb-1 flex flex-wrap gap-1 rounded-lg border border-neutral-800 bg-neutral-900 px-1">
      <Action label="Bold" disabled={disabled} onClick={() => format("bold")}><Bold size={17} /></Action>
      <Action label="Italic" disabled={disabled} onClick={() => format("italic")}><Italic size={17} /></Action>
      <Action label="Underline" disabled={disabled} onClick={() => format("underline")}><Underline size={17} /></Action>
      <Action label="Strikethrough" disabled={disabled} onClick={() => format("strike")}><Strikethrough size={17} /></Action>
      <Action label="Spoiler" disabled={disabled} onClick={() => format("spoiler")}><EyeOff size={17} /></Action>
      <Action label="Code" disabled={disabled} onClick={() => format("code")}><Code size={17} /></Action>
      <Action label="Code block" disabled={disabled} onClick={() => format("codeBlock")}><FileCode2 size={17} /></Action>
      <Action label="Quote" disabled={disabled} onClick={() => format("quote")}><Quote size={17} /></Action>
      <Action label="More formatting" disabled={disabled} onClick={onExpand}><ChevronsUpDown size={17} /></Action>
    </div> : null}
    <div className="flex min-w-0 items-end gap-1">
      {leading}
      <div className="order-1 flex min-w-0 flex-1 items-end rounded-xl border border-neutral-700 bg-neutral-900 px-1 focus-within:border-blue-500">
      <div ref={editor} role="textbox" aria-label="Message text" aria-multiline="true" aria-placeholder="Write a message…" aria-disabled={disabled || undefined} contentEditable={!disabled} suppressContentEditableWarning data-placeholder="Write a message…" onInput={() => { if (!composing.current) commit(); }} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; commit(); }} onMouseUp={remember} onKeyUp={remember} onBlur={remember} onContextMenu={() => { remember(); if (selection.current && !selection.current.collapsed) setFormatOpen(true); }} onPaste={(event) => {
        event.preventDefault(); remember();
        const text = event.clipboardData.getData("text/plain");
        insert(text);
      }} onDrop={(event) => { event.preventDefault(); remember(); insert(event.dataTransfer.getData("text/plain")); }} onKeyDown={(event) => {
        if (event.key === "Escape" && emojiOpen) { event.preventDefault(); setEmojiOpen(false); editor.current?.focus(); restore(); }
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey && ["b", "i"].includes(event.key.toLowerCase())) { event.preventDefault(); remember(); format(event.key.toLowerCase() === "b" ? "bold" : "italic"); }
      }} className="min-h-10 max-h-48 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-2 py-2 text-base leading-6 text-white outline-none empty:before:pointer-events-none empty:before:text-neutral-500 empty:before:content-[attr(data-placeholder)] md:text-sm" />
      <Action label="Formatting" disabled={disabled} onClick={() => { remember(); setFormatOpen(!formatOpen); }}><Type size={18} /></Action>
      <Action label={emojiOpen ? "Close emoji" : "Insert emoji"} disabled={disabled} onClick={() => { remember(); if (!emojiOpen) editor.current?.blur(); setEmojiOpen(!emojiOpen); }}><Smile size={18} /></Action>
      </div>
      {trailing}
    </div>
    {emojiOpen ? <CrmEmojiPanel onClose={() => { setEmojiOpen(false); editor.current?.focus(); restore(); }} onInsert={(value) => { insert(value); if (window.innerWidth <= 768) editor.current?.blur(); }} /> : null}
  </div>;
}
