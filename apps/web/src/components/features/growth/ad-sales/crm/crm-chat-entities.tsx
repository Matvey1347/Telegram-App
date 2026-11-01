import { Fragment, type ReactNode } from "react";

type Entity = { type: string; offset: number; length: number; url?: string; language?: string };
export function chatEntities(value: unknown, text: string): Entity[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).filter((item): item is Entity => !!item && typeof item === "object" && typeof item.type === "string" && Number.isSafeInteger(item.offset) && Number.isSafeInteger(item.length) && item.offset >= 0 && item.length > 0 && item.offset + item.length <= text.length);
}
const safeLink = (value: string) => /^(https?:\/\/|mailto:)/i.test(value) && !/[\u0000-\u001f]/.test(value);
function wrap(entity: Entity, content: ReactNode, original: string): ReactNode {
  switch (entity.type) {
    case "bold": return <strong>{content}</strong>;
    case "italic": return <em>{content}</em>;
    case "underline": return <u>{content}</u>;
    case "strike": return <s>{content}</s>;
    case "code": case "pre": return <code className="rounded bg-black/20 px-1 font-mono">{content}</code>;
    case "blockquote": return <span className="border-l-2 border-blue-400 pl-2">{content}</span>;
    case "spoiler": return <span tabIndex={0} aria-label="Spoiler; focus or hover to reveal" className="rounded bg-neutral-600 text-transparent hover:text-neutral-100 focus:text-neutral-100">{content}</span>;
    case "textUrl": case "url": { const url = entity.type === "url" ? original : entity.url; return url && safeLink(url) ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-300 underline">{content}</a> : content; }
    default: return content;
  }
}
/** JS slice uses Telegram's UTF-16 offsets; text never becomes trusted HTML. */
export function renderChatEntities(text: string, value: unknown) {
  const entities = chatEntities(value, text);
  const boundaries = [...new Set([0, text.length, ...entities.flatMap((e) => [e.offset, e.offset + e.length])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]; let content: ReactNode = text.slice(start, end);
    for (const entity of entities.filter((e) => e.offset <= start && e.offset + e.length >= end).reverse()) content = wrap(entity, content, text.slice(entity.offset, entity.offset + entity.length));
    return <Fragment key={start}>{content}</Fragment>;
  });
}

const escapeMarkup = (text: string) => text.replace(/[\\`*_[\]()#+~|>:]/g, "\\$&");
/** Existing managed editor syntax; no HTML is injected or interpreted. */
export function messageEditorMarkup(text: string, value: unknown) {
  const entities = chatEntities(value, text);
  const markers: Record<string, [string, string]> = { bold: ["**", "**"], italic: ["__", "__"], underline: ["++", "++"], strike: ["~~", "~~"], code: ["`", "`"], pre: ["```\n", "\n```"], spoiler: ["||", "||"], blockquote: [":::quote\n", "\n:::"] };
  const valid = entities.filter((e) => markers[e.type] || (e.type === "textUrl" && e.url && safeLink(e.url)));
  let output = "";
  for (let position = 0; position <= text.length; position++) {
    for (const e of valid.filter((e) => e.offset + e.length === position).sort((a, b) => b.offset - a.offset)) output += e.type === "textUrl" ? `](${e.url})` : markers[e.type][1];
    for (const e of valid.filter((e) => e.offset === position).sort((a, b) => b.length - a.length)) output += e.type === "textUrl" ? "[" : markers[e.type][0];
    if (position < text.length) output += escapeMarkup(text[position]);
  }
  return output;
}
