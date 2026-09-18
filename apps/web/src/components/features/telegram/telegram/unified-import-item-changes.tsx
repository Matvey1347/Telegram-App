import type { TelegramUnifiedImportPreviewItem } from "@telegram-system/shared";
import { useI18n } from "@/providers/i18n-provider";

export function UnifiedImportItemChanges({
  item,
}: {
  item?: Pick<TelegramUnifiedImportPreviewItem, "ref" | "action" | "changes">;
}) {
  const { t } = useI18n();
  if (!item || !["UPDATE", "ARCHIVE"].includes(item.action)) return null;

  const fieldLabels: Record<string, string> = {
    icon: t("telegram.posts.import.changeField.icon"),
    title: t("telegram.posts.import.changeField.title"),
    name: t("telegram.posts.import.changeField.name"),
    description: t("telegram.posts.import.changeField.description"),
    status: t("telegram.posts.import.changeField.status"),
    conclusion: t("telegram.posts.import.changeField.conclusion"),
    text: t("telegram.posts.import.changeField.text"),
    imageUrls: t("telegram.posts.import.changeField.imageUrls"),
  };

  return (
    <div
      data-import-item-ref={item.ref}
      className="mt-3 space-y-1.5 rounded-md border border-blue-900/60 bg-blue-950/15 p-2"
    >
      {item.changes?.length ? (
        item.changes.map((change) => (
          <div
            key={change.field}
            className="grid gap-1 text-xs sm:grid-cols-[110px_minmax(0,1fr)_auto_minmax(0,1fr)]"
          >
            <span className="text-neutral-400">
              {fieldLabels[change.field] ?? change.field}
            </span>
            <span className="whitespace-pre-wrap break-words rounded bg-rose-950/30 px-2 py-1 text-rose-200">
              {change.before ?? t("telegram.posts.import.emptyValue")}
            </span>
            <span className="self-center text-neutral-500">→</span>
            <span className="whitespace-pre-wrap break-words rounded bg-emerald-950/30 px-2 py-1 text-emerald-200">
              {change.after ?? t("telegram.posts.import.emptyValue")}
            </span>
          </div>
        ))
      ) : (
        <p className="text-xs text-neutral-500">
          {t("telegram.posts.import.noChanges")}
        </p>
      )}
    </div>
  );
}
