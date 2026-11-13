import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/primitives";

export function AiPostingLengthTooltip() {
  return (
    <Tooltip
      content={
        <span className="block max-w-xs">
          Включено: AI сам выбирает короткий, средний или длинный текст по
          сложности темы. Длины не чередуются по жёсткой схеме. Выключено: AI
          старается придерживаться средней длины, увеличивая текст только когда
          тема этого требует.
        </span>
      }
    >
      <span
        tabIndex={0}
        role="button"
        aria-label="Что означает автоопределение длины"
        className="inline-flex h-9 w-9 shrink-0 cursor-help items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Info size={16} />
      </span>
    </Tooltip>
  );
}
