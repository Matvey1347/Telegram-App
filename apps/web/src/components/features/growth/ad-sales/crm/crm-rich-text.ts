/** Translate the existing Telegram draft syntax to editable DOM without trusting HTML. */
const markers: Record<string, string> = { '**': 'strong', '__': 'em', '++': 'u', '~~': 's', '||': 'span', '`': 'code' };
const reverse: Record<string, string> = { STRONG: '**', B: '**', EM: '__', I: '__', U: '++', S: '~~', STRIKE: '~~', CODE: '`' };

function appendInline(parent: Node, text: string) {
  const pattern = /!\[([^\]\n]*)\]\(tg:\/\/emoji\?id=(\d+)\)|\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\\([\\`*_\[\]()#+~|>:])|\*\*|__|\+\+|~~|\|\||`/g;
  let position = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    parent.appendChild(document.createTextNode(text.slice(position, match.index)));
    if (match[1] !== undefined) {
      const emoji = document.createElement('span');
      emoji.dataset.raw = match[0]; emoji.contentEditable = 'false'; emoji.textContent = match[1];
      parent.appendChild(emoji); position = pattern.lastIndex; continue;
    }
    if (match[3] !== undefined) {
      const link = document.createElement('span');
      link.dataset.link = match[4]; link.className = 'text-blue-300 underline';
      appendInline(link, match[3]); parent.appendChild(link);
      position = pattern.lastIndex; continue;
    }
    if (match[5] !== undefined) {
      const literal = document.createElement('span');
      literal.dataset.raw = match[0]; literal.textContent = match[5]; parent.appendChild(literal);
      position = pattern.lastIndex; continue;
    }
    const marker = match[0];
    const end = text.indexOf(marker, pattern.lastIndex);
    if (end < pattern.lastIndex || end === pattern.lastIndex) {
      parent.appendChild(document.createTextNode(marker)); position = pattern.lastIndex; continue;
    }
    const node = document.createElement(markers[marker]);
    if (marker === '||') { node.dataset.marker = marker; node.className = 'rounded bg-neutral-600 px-0.5'; }
    appendInline(node, text.slice(pattern.lastIndex, end)); parent.appendChild(node);
    position = end + marker.length; pattern.lastIndex = position;
  }
  parent.appendChild(document.createTextNode(text.slice(position)));
}

function appendPlain(parent: HTMLElement, value: string) {
  value.split("\n").forEach((line, index) => {
    if (index) parent.appendChild(document.createElement("br"));
    if (line.startsWith("> ")) {
      const quote = document.createElement("span"); quote.dataset.quote = "true"; quote.className = "border-l-2 border-blue-400 pl-2";
      appendInline(quote, line.slice(2)); parent.appendChild(quote);
    } else appendInline(parent, line);
  });
}

function appendCode(parent: HTMLElement, info: string, body: string) {
  const block = document.createElement("span");
  block.dataset.codeBlock = info;
  block.className = "my-1 block rounded-md bg-neutral-950 px-2 py-1 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]";
  block.textContent = body;
  parent.appendChild(block);
}

function appendTable(parent: HTMLElement, header: string, body: string) {
  const rows = body.split("\n");
  // Preserve unsupported row syntax literally instead of changing its meaning.
  if (rows.some((row) => !row.startsWith("|") || !row.endsWith("|"))) {
    appendPlain(parent, `:::table${header}\n${body}\n:::`); return;
  }
  const table = document.createElement("span");
  table.dataset.tableBlock = header;
  table.className = "my-1 block max-w-full overflow-x-auto rounded-md border border-neutral-700 text-xs";
  rows.forEach((row, index) => {
    const rowNode = document.createElement("span"); rowNode.dataset.tableRow = "true";
    rowNode.className = "flex min-w-max border-b border-neutral-700 last:border-b-0";
    row.slice(1, -1).split("|").forEach((cell) => {
      const cellNode = document.createElement("span"); cellNode.dataset.tableCell = "true";
      cellNode.className = `min-w-20 flex-1 border-r border-neutral-700 px-1 last:border-r-0 ${index === 0 && /(?:^|\s)header(?:\s|$)/.test(header) ? "font-semibold" : ""}`;
      appendInline(cellNode, cell); rowNode.appendChild(cellNode);
    });
    table.appendChild(rowNode);
  });
  parent.appendChild(table);
}

export function renderCrmDraft(element: HTMLElement, value: string) {
  element.replaceChildren();
  if (!value) return;
  const blocks = /```([^\n\r`]*)\n([\s\S]*?)```|^:::table([^\n]*)\n([\s\S]*?)\n:::/gm;
  let position = 0;
  for (let match = blocks.exec(value); match; match = blocks.exec(value)) {
    appendPlain(element, value.slice(position, match.index));
    if (match[1] !== undefined) appendCode(element, match[1], match[2]);
    else appendTable(element, match[3], match[4]);
    position = blocks.lastIndex;
  }
  appendPlain(element, value.slice(position));
}

export function serializeCrmDraft(root: Node): string {
  const serialize = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    if (node.tagName === 'BR') return '\n';
    if (node.dataset.raw) {
      const visible = node.dataset.raw.startsWith('![') ? /^!\[([^\]]*)\]/.exec(node.dataset.raw)?.[1] : node.dataset.raw.slice(1);
      if (node.textContent === visible) return node.dataset.raw;
    }
    if (node.dataset.codeBlock !== undefined) return `\`\`\`${node.dataset.codeBlock}\n${children(node)}\`\`\``;
    if (node.dataset.tableBlock !== undefined) {
      const rows = [...node.children].filter((row): row is HTMLElement => row instanceof HTMLElement && row.dataset.tableRow === "true");
      return `:::table${node.dataset.tableBlock}\n${rows.map((row) => `|${[...row.children].filter((cell): cell is HTMLElement => cell instanceof HTMLElement && cell.dataset.tableCell === "true").map(children).join("|")}|`).join("\n")}\n:::`;
    }
    const inner = children(node);
    if (node.dataset.quote === 'true' || node.tagName === 'BLOCKQUOTE') return inner.split('\n').map((line) => `> ${line}`).join('\n');
    if (node.dataset.link) return `[${inner}](${node.dataset.link})`;
    const marker = node.dataset.marker ?? reverse[node.tagName];
    if (marker && inner) return `${marker}${inner}${marker}`;
    return inner;
  };
  const children = (node: Node) => [...node.childNodes].reduce((result, child) => {
    const isBlock = child instanceof HTMLElement && ['DIV', 'P'].includes(child.tagName);
    return result + (isBlock && result && !result.endsWith('\n') ? '\n' : '') + serialize(child);
  }, '');
  return children(root);
}
