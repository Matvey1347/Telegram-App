export type TelegramTableCellAlignment = "left" | "center" | "right";

export type TelegramTableCellMarkup = {
  text: string;
  align: TelegramTableCellAlignment | null;
  highlight: boolean | null;
};

const CELL_MARKER = /^\{\{cell((?:\s+[a-z]+=(?:[a-z]+))*)\}\}/i;

export function parseTelegramTableCellMarkup(
  source: string,
): TelegramTableCellMarkup {
  const match = source.match(CELL_MARKER);
  if (!match) return { text: source, align: null, highlight: null };
  const options = new Map(
    match[1]
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((option) => option.split("=", 2) as [string, string]),
  );
  const align = options.get("align");
  const highlight = options.get("highlight");
  return {
    text: source.slice(match[0].length),
    align:
      align === "left" || align === "center" || align === "right"
        ? align
        : null,
    highlight:
      highlight === "true" ? true : highlight === "false" ? false : null,
  };
}

export function serializeTelegramTableCellMarkup(
  cell: TelegramTableCellMarkup,
) {
  const options = [
    cell.align ? `align=${cell.align}` : "",
    cell.highlight == null ? "" : `highlight=${cell.highlight}`,
  ].filter(Boolean);
  return `${options.length ? `{{cell ${options.join(" ")}}}` : ""}${cell.text}`;
}
