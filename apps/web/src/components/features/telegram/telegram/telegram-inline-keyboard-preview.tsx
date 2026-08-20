"use client";

import type { TelegramPostButtonRows } from "@telegram-system/shared";

const styles = {
  default: "bg-[#1f3244] text-[#f5f7fa]",
  primary: "bg-[#2b7eb6] text-white",
  success: "bg-[#277e5b] text-white",
  danger: "bg-[#a94e56] text-white",
} as const;

export function TelegramInlineKeyboardPreview({
  buttonRows,
}: {
  buttonRows: TelegramPostButtonRows;
}) {
  const rows = buttonRows
    .map((row) => row.filter((button) => button.text.trim() && button.url.trim()))
    .filter((row) => row.length);
  if (!rows.length) return null;
  return (
    <div className="space-y-1.5 rounded-[14px] bg-[#1f3042] p-1.5 shadow-md" data-testid="telegram-inline-keyboard-preview">
      {rows.map((row, rowIndex) => (
        <div className="flex gap-1.5" key={`row-${rowIndex}`}>
          {row.map((button, buttonIndex) => (
            <button
              key={`button-${rowIndex}-${buttonIndex}`}
              type="button"
              onClick={(event) => event.preventDefault()}
              className={`min-w-0 flex-1 rounded-[9px] px-2 py-2.5 text-center text-[15px] font-medium leading-tight shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] ${styles[button.style]}`}
              title={button.text}
            >
              <span className="block break-words">{button.text}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
