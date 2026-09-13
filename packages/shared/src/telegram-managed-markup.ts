const formattingMarkers = ["**", "__", "++", "~~", "||"] as const;

/**
 * Telegram can return duplicate or touching entities for the same visual
 * style. Their markdown-like representation contains runs such as `****`.
 * Collapse those runs before rendering so implementation delimiters never
 * become visible text.
 *
 * Callers protect escaped literals, code and links with tokens first.
 */
export function normalizeTelegramManagedFormattingRuns(value: string) {
  return formattingMarkers.reduce(
    (current, marker) => normalizeMarkerRuns(current, marker),
    value,
  );
}

function normalizeMarkerRuns(value: string, marker: string) {
  let active = false;
  let output = "";
  for (let index = 0; index < value.length; ) {
    if (!value.startsWith(marker, index)) {
      output += value[index];
      index += 1;
      continue;
    }
    const start = index;
    let count = 0;
    while (value.startsWith(marker, index)) {
      count += 1;
      index += marker.length;
    }
    if (count === 1) {
      output += marker;
      active = !active;
      continue;
    }
    const touchesContentOnSameLine =
      start > 0 &&
      index < value.length &&
      value[start - 1] !== "\n" &&
      value[index] !== "\n";
    if (active && touchesContentOnSameLine) continue;
    output += marker;
    active = !active;
  }
  return output;
}
