import { Sparkles } from "lucide-react";
import { useI18n } from "@/providers/i18n-provider";

export function ManagedPostAiBadge() {
  const { t } = useI18n();
  const label = t("telegram.posts.editor.aiGenerated");
  return (
    <span
      title={label}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-violet-700/70 bg-violet-950/40 px-1.5 py-0.5 text-[10px] font-medium text-violet-200"
    >
      <Sparkles size={11} aria-hidden />
      <span aria-hidden>AI</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
