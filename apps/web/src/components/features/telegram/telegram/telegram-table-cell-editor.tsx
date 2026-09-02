"use client";


import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Columns3,
  Highlighter,
  Rows3,
  Table2,
  Trash2,
} from "lucide-react";
import {
  type MouseEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { TelegramTableCellAlignment } from "@telegram-system/shared";
import { useI18n } from "@/providers/i18n-provider";

type TableAction =
  | "insert-above"
  | "insert-below"
  | "insert-left"
  | "insert-right"
  | "highlight"
  | "remove-highlight"
  | "align-left"
  | "align-center"
  | "align-right"
  | "delete-row"
  | "delete-column";

export function useTelegramTableCellEditor(
  contentRef: RefObject<HTMLDivElement | null>,
  emitChange: () => void,
) {
  const { t } = useI18n();
  const activeCellRef = useRef<HTMLTableCellElement | null>(null);
  const [control, setControl] = useState<{
    top: number;
    left: number;
    menuOpen: boolean;
    highlighted: boolean;
  } | null>(null);

  const selectCell = useCallback(
    (cell: HTMLTableCellElement, menuOpen: boolean) => {
      const rect = cell.getBoundingClientRect();
      activeCellRef.current = cell;
      setControl({
        top: menuOpen ? rect.top : rect.top + 3,
        left: menuOpen ? rect.right + 8 : rect.right - 34,
        menuOpen,
        highlighted: cell.dataset.highlight === "true",
      });
    },
    [],
  );

  const mutate = useCallback(
    (action: TableAction) => {
      const cell = activeCellRef.current;
      const row = cell?.closest("tr") as HTMLTableRowElement | null;
      const table = cell?.closest("table") as HTMLTableElement | null;
      if (!cell || !row || !table) return;
      const rows = Array.from(table.rows);
      const cellIndex = Array.from(row.cells).indexOf(cell);
      const makeCell = (highlighted = false) => {
        const next = document.createElement("td");
        next.innerHTML = "<br>";
        next.dataset.highlight = String(highlighted);
        next.dataset.align = "left";
        next.style.textAlign = "left";
        next.classList.toggle("tg-rich-table-cell-highlight", highlighted);
        return next;
      };

      if (action === "insert-above" || action === "insert-below") {
        const nextRow = document.createElement("tr");
        const columnCount = Math.max(...rows.map((item) => item.cells.length));
        for (let index = 0; index < columnCount; index += 1) {
          nextRow.appendChild(makeCell(false));
        }
        row.parentElement?.insertBefore(
          nextRow,
          action === "insert-above" ? row : row.nextSibling,
        );
      } else if (action === "insert-left" || action === "insert-right") {
        for (const currentRow of rows) {
          const reference = currentRow.cells[cellIndex] || null;
          const rowHighlighted = Array.from(currentRow.cells).some(
            (item) => item.dataset.highlight === "true",
          );
          currentRow.insertBefore(
            makeCell(rowHighlighted),
            action === "insert-left"
              ? reference
              : reference?.nextSibling || null,
          );
        }
      } else if (action === "highlight" || action === "remove-highlight") {
        const highlighted = action === "highlight";
        cell.dataset.highlight = String(highlighted);
        cell.classList.toggle("tg-rich-table-cell-highlight", highlighted);
      } else if (action.startsWith("align-")) {
        const align = action.slice(
          "align-".length,
        ) as TelegramTableCellAlignment;
        cell.dataset.align = align;
        cell.style.textAlign = align;
      } else if (action === "delete-row") {
        if (rows.length === 1) table.remove();
        else row.remove();
      } else if (action === "delete-column") {
        const widestRow = Math.max(...rows.map((item) => item.cells.length));
        if (widestRow === 1) table.remove();
        else
          rows.forEach((currentRow) => currentRow.cells[cellIndex]?.remove());
      }

      setControl(null);
      activeCellRef.current = null;
      emitChange();
      contentRef.current?.focus();
    },
    [contentRef, emitChange],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const cell = (event.target as HTMLElement).closest("th, td");
      if (cell && contentRef.current?.contains(cell)) {
        selectCell(cell as HTMLTableCellElement, false);
      } else {
        setControl(null);
        activeCellRef.current = null;
      }
    },
    [contentRef, selectCell],
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const cell = (event.target as HTMLElement).closest("th, td");
      if (!cell || !contentRef.current?.contains(cell)) return;
      event.preventDefault();
      selectCell(cell as HTMLTableCellElement, true);
    },
    [contentRef, selectCell],
  );

  const overlay =
    control && typeof document !== "undefined"
      ? createPortal(
          control.menuOpen ? (
            <TableCellMenu
              top={control.top}
              left={control.left}
              highlighted={control.highlighted}
              onAction={mutate}
              onClose={() => {
                activeCellRef.current = null;
                setControl(null);
              }}
            />
          ) : (
            <button
              type="button"
              title={t("telegram.posts.editorComponents.table.edit")}
              aria-label={t("telegram.posts.editorComponents.table.edit")}
              className="fixed z-[330] inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#3a4d60] bg-[#172534] text-[#b5c5d3] shadow-xl hover:bg-[#22374a] hover:text-white"
              style={{ top: control.top, left: control.left }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const cell = activeCellRef.current;
                if (cell) selectCell(cell, true);
              }}
            >
              <Table2 size={17} />
            </button>
          ),
          document.body,
        )
      : null;

  return { handleClick, handleContextMenu, overlay };
}

function TableCellMenu({
  top,
  left,
  highlighted,
  onAction,
  onClose,
}: {
  top: number;
  left: number;
  highlighted: boolean;
  onAction: (action: TableAction) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose]);
  return (
    <div
      role="menu"
      aria-label={t("telegram.posts.editorComponents.table.cellActions")}
      className="fixed z-[340] w-64 rounded-2xl border border-[#2a3a4a] bg-[#17212b] p-2 shadow-2xl"
      style={{
        top: Math.max(8, top),
        left: Math.max(8, Math.min(left, window.innerWidth - 272)),
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <Item
        icon={Rows3}
        label={t("telegram.posts.editorComponents.table.insertAbove")}
        onClick={() => onAction("insert-above")}
      />
      <Item
        icon={Rows3}
        label={t("telegram.posts.editorComponents.table.insertBelow")}
        onClick={() => onAction("insert-below")}
      />
      <Item
        icon={Columns3}
        label={t("telegram.posts.editorComponents.table.insertLeft")}
        onClick={() => onAction("insert-left")}
      />
      <Item
        icon={Columns3}
        label={t("telegram.posts.editorComponents.table.insertRight")}
        onClick={() => onAction("insert-right")}
      />
      <Divider />
      <Item
        icon={Highlighter}
        label={t("telegram.posts.editorComponents.table.highlight")}
        disabled={highlighted}
        onClick={() => onAction("highlight")}
      />
      <Item
        icon={Highlighter}
        label={t("telegram.posts.editorComponents.table.removeHighlight")}
        disabled={!highlighted}
        onClick={() => onAction("remove-highlight")}
      />
      <Divider />
      <Item
        icon={AlignLeft}
        label={t("telegram.posts.editorComponents.table.alignLeft")}
        onClick={() => onAction("align-left")}
      />
      <Item
        icon={AlignCenter}
        label={t("telegram.posts.editorComponents.table.alignCenter")}
        onClick={() => onAction("align-center")}
      />
      <Item
        icon={AlignRight}
        label={t("telegram.posts.editorComponents.table.alignRight")}
        onClick={() => onAction("align-right")}
      />
      <Divider />
      <Item
        danger
        icon={Trash2}
        label={t("telegram.posts.editorComponents.table.deleteRow")}
        onClick={() => onAction("delete-row")}
      />
      <Item
        danger
        icon={Trash2}
        label={t("telegram.posts.editorComponents.table.deleteColumn")}
        onClick={() => onAction("delete-column")}
      />
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-[#314252]" />;
}

function Item({
  icon: Icon,
  label,
  danger = false,
  disabled = false,
  onClick,
}: {
  icon: typeof Table2;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition disabled:opacity-35 ${danger ? "text-red-400 hover:bg-red-950/30" : "text-[#e7edf3] hover:bg-[#223243]"}`}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );
}
